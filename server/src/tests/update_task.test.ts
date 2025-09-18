import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, tasksTable, notesTable } from '../db/schema';
import { type UpdateTaskInput } from '../schema';
import { updateTask } from '../handlers/update_task';
import { eq } from 'drizzle-orm';

describe('updateTask', () => {
  let testUser: any;
  let testWorkspace: any;
  let testTask: any;
  let testNote: any;

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
      .returning()
      .execute();
    testUser = userResult[0];

    // Create test workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: testUser.id,
        name: 'Test Workspace',
        settings: null
      })
      .returning()
      .execute();
    testWorkspace = workspaceResult[0];

    // Create test note for linking
    const noteResult = await db.insert(notesTable)
      .values({
        workspace_id: testWorkspace.id,
        title: 'Test Note',
        source: 'manual',
        content_md: 'Test content',
        created_by: testUser.id
      })
      .returning()
      .execute();
    testNote = noteResult[0];

    // Create test task
    const taskResult = await db.insert(tasksTable)
      .values({
        workspace_id: testWorkspace.id,
        title: 'Original Task',
        description: 'Original description',
        status: 'todo',
        priority: 'low',
        due_at: new Date('2024-12-31'),
        assignee_id: testUser.id,
        linked_note_id: null
      })
      .returning()
      .execute();
    testTask = taskResult[0];
  });

  afterEach(resetDB);

  it('should update task title', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      title: 'Updated Task Title'
    };

    const result = await updateTask(input);

    expect(result.title).toEqual('Updated Task Title');
    expect(result.id).toEqual(testTask.id);
    expect(result.description).toEqual(testTask.description); // Should remain unchanged
    expect(result.status).toEqual(testTask.status);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at.getTime()).toBeGreaterThan(testTask.updated_at.getTime());
  });

  it('should update task status', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      status: 'done'
    };

    const result = await updateTask(input);

    expect(result.status).toEqual('done');
    expect(result.title).toEqual(testTask.title); // Should remain unchanged
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update task priority', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      priority: 'high'
    };

    const result = await updateTask(input);

    expect(result.priority).toEqual('high');
    expect(result.title).toEqual(testTask.title);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update task due date', async () => {
    const newDueDate = new Date('2025-01-15');
    const input: UpdateTaskInput = {
      id: testTask.id,
      due_at: newDueDate
    };

    const result = await updateTask(input);

    expect(result.due_at).toBeInstanceOf(Date);
    expect(result.due_at?.getTime()).toEqual(newDueDate.getTime());
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should set due date to null', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      due_at: null
    };

    const result = await updateTask(input);

    expect(result.due_at).toBeNull();
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update task description', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      description: 'Updated description'
    };

    const result = await updateTask(input);

    expect(result.description).toEqual('Updated description');
    expect(result.title).toEqual(testTask.title);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should set description to null', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      description: null
    };

    const result = await updateTask(input);

    expect(result.description).toBeNull();
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update linked note', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      linked_note_id: testNote.id
    };

    const result = await updateTask(input);

    expect(result.linked_note_id).toEqual(testNote.id);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should unlink note by setting to null', async () => {
    // First link a note
    await updateTask({
      id: testTask.id,
      linked_note_id: testNote.id
    });

    // Then unlink it
    const input: UpdateTaskInput = {
      id: testTask.id,
      linked_note_id: null
    };

    const result = await updateTask(input);

    expect(result.linked_note_id).toBeNull();
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update multiple fields simultaneously', async () => {
    const newDueDate = new Date('2025-02-28');
    const input: UpdateTaskInput = {
      id: testTask.id,
      title: 'Multi-update Task',
      status: 'doing',
      priority: 'high',
      due_at: newDueDate,
      description: 'Updated with multiple fields',
      linked_note_id: testNote.id
    };

    const result = await updateTask(input);

    expect(result.title).toEqual('Multi-update Task');
    expect(result.status).toEqual('doing');
    expect(result.priority).toEqual('high');
    expect(result.due_at?.getTime()).toEqual(newDueDate.getTime());
    expect(result.description).toEqual('Updated with multiple fields');
    expect(result.linked_note_id).toEqual(testNote.id);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at.getTime()).toBeGreaterThan(testTask.updated_at.getTime());
  });

  it('should update assignee', async () => {
    // Create another user
    const anotherUserResult = await db.insert(usersTable)
      .values({
        email: 'another@example.com',
        display_name: 'Another User',
        timezone: 'Australia/Sydney',
        llm_provider: 'openai',
        llm_model: 'gpt-4'
      })
      .returning()
      .execute();
    const anotherUser = anotherUserResult[0];

    const input: UpdateTaskInput = {
      id: testTask.id,
      assignee_id: anotherUser.id
    };

    const result = await updateTask(input);

    expect(result.assignee_id).toEqual(anotherUser.id);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save changes to database', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      title: 'Database Update Test',
      status: 'done'
    };

    await updateTask(input);

    // Verify changes are persisted in database
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.id, testTask.id))
      .execute();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toEqual('Database Update Test');
    expect(tasks[0].status).toEqual('done');
    expect(tasks[0].updated_at).toBeInstanceOf(Date);
    expect(tasks[0].updated_at.getTime()).toBeGreaterThan(testTask.updated_at.getTime());
  });

  it('should throw error for non-existent task', async () => {
    const input: UpdateTaskInput = {
      id: '00000000-0000-0000-0000-000000000000',
      title: 'Non-existent Task'
    };

    await expect(updateTask(input)).rejects.toThrow(/not found/i);
  });

  it('should preserve unchanged fields', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      title: 'Only Title Changed'
    };

    const result = await updateTask(input);

    // Verify unchanged fields are preserved
    expect(result.workspace_id).toEqual(testTask.workspace_id);
    expect(result.description).toEqual(testTask.description);
    expect(result.status).toEqual(testTask.status);
    expect(result.priority).toEqual(testTask.priority);
    expect(result.assignee_id).toEqual(testTask.assignee_id);
    expect(result.linked_note_id).toEqual(testTask.linked_note_id);
    expect(result.created_at.getTime()).toEqual(testTask.created_at.getTime());
    
    // But updated_at should change
    expect(result.updated_at.getTime()).toBeGreaterThan(testTask.updated_at.getTime());
  });

  it('should handle foreign key constraint for invalid assignee', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      assignee_id: '00000000-0000-0000-0000-000000000000'
    };

    await expect(updateTask(input)).rejects.toThrow();
  });

  it('should handle foreign key constraint for invalid linked note', async () => {
    const input: UpdateTaskInput = {
      id: testTask.id,
      linked_note_id: '00000000-0000-0000-0000-000000000000'
    };

    await expect(updateTask(input)).rejects.toThrow();
  });
});