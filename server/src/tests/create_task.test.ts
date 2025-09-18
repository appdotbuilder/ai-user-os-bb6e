import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { tasksTable, usersTable, workspacesTable, notesTable } from '../db/schema';
import { type CreateTaskInput } from '../schema';
import { createTask } from '../handlers/create_task';
import { eq, and } from 'drizzle-orm';

describe('createTask', () => {
  let testUser: { id: string };
  let testWorkspace: { id: string };
  let testNote: { id: string };

  beforeEach(async () => {
    await createDB();

    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4'
      })
      .returning({ id: usersTable.id })
      .execute();
    testUser = userResult[0];

    // Create test workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: testUser.id,
        name: 'Test Workspace'
      })
      .returning({ id: workspacesTable.id })
      .execute();
    testWorkspace = workspaceResult[0];

    // Create test note
    const noteResult = await db.insert(notesTable)
      .values({
        workspace_id: testWorkspace.id,
        title: 'Test Note',
        source: 'manual',
        created_by: testUser.id
      })
      .returning({ id: notesTable.id })
      .execute();
    testNote = noteResult[0];
  });

  afterEach(resetDB);

  it('should create a task with all fields', async () => {
    const dueDate = new Date('2024-12-25T10:00:00Z');
    const input: CreateTaskInput = {
      workspace_id: testWorkspace.id,
      title: 'Complete project documentation',
      description: 'Write comprehensive documentation for the project',
      priority: 'high',
      due_at: dueDate,
      assignee_id: testUser.id,
      linked_note_id: testNote.id
    };

    const result = await createTask(input);

    // Verify basic fields
    expect(result.id).toBeDefined();
    expect(result.workspace_id).toEqual(testWorkspace.id);
    expect(result.title).toEqual('Complete project documentation');
    expect(result.description).toEqual('Write comprehensive documentation for the project');
    expect(result.status).toEqual('todo'); // Database default
    expect(result.priority).toEqual('high');
    expect(result.due_at).toBeInstanceOf(Date);
    expect(result.due_at?.toISOString()).toEqual(dueDate.toISOString());
    expect(result.assignee_id).toEqual(testUser.id);
    expect(result.linked_note_id).toEqual(testNote.id);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a task with minimum required fields', async () => {
    const input: CreateTaskInput = {
      workspace_id: testWorkspace.id,
      title: 'Simple task',
      assignee_id: testUser.id,
      priority: 'med' // Priority is required in the parsed input type
      // other optional fields not provided
    };

    const result = await createTask(input);

    expect(result.title).toEqual('Simple task');
    expect(result.description).toBeNull();
    expect(result.status).toEqual('todo');
    expect(result.priority).toEqual('med');
    expect(result.due_at).toBeNull();
    expect(result.linked_note_id).toBeNull();
  });

  it('should save task to database', async () => {
    const input: CreateTaskInput = {
      workspace_id: testWorkspace.id,
      title: 'Database test task',
      assignee_id: testUser.id,
      priority: 'low'
    };

    const result = await createTask(input);

    // Verify task was saved to database
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.id, result.id))
      .execute();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toEqual('Database test task');
    expect(tasks[0].workspace_id).toEqual(testWorkspace.id);
    expect(tasks[0].assignee_id).toEqual(testUser.id);
    expect(tasks[0].priority).toEqual('low');
    expect(tasks[0].status).toEqual('todo');
  });

  it('should create task without linked note', async () => {
    const input: CreateTaskInput = {
      workspace_id: testWorkspace.id,
      title: 'Standalone task',
      assignee_id: testUser.id,
      priority: 'med'
    };

    const result = await createTask(input);

    expect(result.linked_note_id).toBeNull();
    expect(result.title).toEqual('Standalone task');
  });

  it('should handle due date correctly', async () => {
    const futureDate = new Date('2025-01-15T14:30:00Z');
    const input: CreateTaskInput = {
      workspace_id: testWorkspace.id,
      title: 'Scheduled task',
      assignee_id: testUser.id,
      due_at: futureDate,
      priority: 'high'
    };

    const result = await createTask(input);

    expect(result.due_at).toBeInstanceOf(Date);
    expect(result.due_at?.toISOString()).toEqual(futureDate.toISOString());
  });

  it('should throw error for non-existent workspace', async () => {
    const input: CreateTaskInput = {
      workspace_id: '00000000-0000-0000-0000-000000000000',
      title: 'Task with invalid workspace',
      assignee_id: testUser.id,
      priority: 'med'
    };

    expect(createTask(input)).rejects.toThrow(/workspace.*not found/i);
  });

  it('should throw error for non-existent assignee', async () => {
    const input: CreateTaskInput = {
      workspace_id: testWorkspace.id,
      title: 'Task with invalid assignee',
      assignee_id: '00000000-0000-0000-0000-000000000000',
      priority: 'med'
    };

    expect(createTask(input)).rejects.toThrow(/user.*not found/i);
  });

  it('should throw error for non-existent linked note', async () => {
    const input: CreateTaskInput = {
      workspace_id: testWorkspace.id,
      title: 'Task with invalid note',
      assignee_id: testUser.id,
      linked_note_id: '00000000-0000-0000-0000-000000000000',
      priority: 'med'
    };

    expect(createTask(input)).rejects.toThrow(/note.*not found/i);
  });

  it('should throw error when note belongs to different workspace', async () => {
    // Create another workspace
    const anotherUser = await db.insert(usersTable)
      .values({
        email: 'other@example.com',
        display_name: 'Other User'
      })
      .returning({ id: usersTable.id })
      .execute();

    const otherWorkspace = await db.insert(workspacesTable)
      .values({
        owner_id: anotherUser[0].id,
        name: 'Other Workspace'
      })
      .returning({ id: workspacesTable.id })
      .execute();

    const input: CreateTaskInput = {
      workspace_id: otherWorkspace[0].id,
      title: 'Task with note from wrong workspace',
      assignee_id: testUser.id,
      linked_note_id: testNote.id, // Note belongs to testWorkspace, not otherWorkspace
      priority: 'med'
    };

    expect(createTask(input)).rejects.toThrow(/note.*not found.*workspace/i);
  });

  it('should handle all priority levels correctly', async () => {
    const priorities = ['low', 'med', 'high'] as const;

    for (const priority of priorities) {
      const input: CreateTaskInput = {
        workspace_id: testWorkspace.id,
        title: `Task with ${priority} priority`,
        assignee_id: testUser.id,
        priority: priority
      };

      const result = await createTask(input);
      expect(result.priority).toEqual(priority);
    }
  });

  it('should set correct timestamps', async () => {
    const beforeCreate = new Date();
    
    const input: CreateTaskInput = {
      workspace_id: testWorkspace.id,
      title: 'Timestamp test task',
      assignee_id: testUser.id,
      priority: 'med'
    };

    const result = await createTask(input);
    const afterCreate = new Date();

    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.created_at.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(result.created_at.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    expect(result.updated_at.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(result.updated_at.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
  });
});