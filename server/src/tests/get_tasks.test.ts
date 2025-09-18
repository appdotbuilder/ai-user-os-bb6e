import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, tasksTable } from '../db/schema';
import { getTasks } from '../handlers/get_tasks';
import { eq } from 'drizzle-orm';

describe('getTasks', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return all tasks for a workspace', async () => {
    // Create user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: userId,
        name: 'Test Workspace',
        settings: null
      })
      .returning()
      .execute();

    const workspaceId = workspaceResult[0].id;

    // Create multiple tasks with different statuses
    await db.insert(tasksTable)
      .values([
        {
          workspace_id: workspaceId,
          title: 'Task 1',
          description: 'First task',
          status: 'todo',
          priority: 'high',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        },
        {
          workspace_id: workspaceId,
          title: 'Task 2',
          description: 'Second task',
          status: 'doing',
          priority: 'med',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        },
        {
          workspace_id: workspaceId,
          title: 'Task 3',
          description: 'Third task',
          status: 'done',
          priority: 'low',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        }
      ])
      .execute();

    const result = await getTasks(workspaceId);

    expect(result).toHaveLength(3);
    expect(result[0].title).toEqual('Task 1');
    expect(result[0].status).toEqual('todo');
    expect(result[0].priority).toEqual('high');
    expect(result[0].workspace_id).toEqual(workspaceId);
    expect(result[0].assignee_id).toEqual(userId);
    expect(result[0].id).toBeDefined();
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].updated_at).toBeInstanceOf(Date);
  });

  it('should filter tasks by status', async () => {
    // Create user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: userId,
        name: 'Test Workspace',
        settings: null
      })
      .returning()
      .execute();

    const workspaceId = workspaceResult[0].id;

    // Create tasks with different statuses
    await db.insert(tasksTable)
      .values([
        {
          workspace_id: workspaceId,
          title: 'Todo Task',
          description: 'Task to do',
          status: 'todo',
          priority: 'med',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        },
        {
          workspace_id: workspaceId,
          title: 'Doing Task',
          description: 'Task in progress',
          status: 'doing',
          priority: 'med',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        },
        {
          workspace_id: workspaceId,
          title: 'Done Task',
          description: 'Completed task',
          status: 'done',
          priority: 'med',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        }
      ])
      .execute();

    // Test filtering by 'todo' status
    const todoTasks = await getTasks(workspaceId, 'todo');
    expect(todoTasks).toHaveLength(1);
    expect(todoTasks[0].title).toEqual('Todo Task');
    expect(todoTasks[0].status).toEqual('todo');

    // Test filtering by 'doing' status
    const doingTasks = await getTasks(workspaceId, 'doing');
    expect(doingTasks).toHaveLength(1);
    expect(doingTasks[0].title).toEqual('Doing Task');
    expect(doingTasks[0].status).toEqual('doing');

    // Test filtering by 'done' status
    const doneTasks = await getTasks(workspaceId, 'done');
    expect(doneTasks).toHaveLength(1);
    expect(doneTasks[0].title).toEqual('Done Task');
    expect(doneTasks[0].status).toEqual('done');
  });

  it('should return empty array for workspace with no tasks', async () => {
    // Create user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create workspace but no tasks
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: userId,
        name: 'Empty Workspace',
        settings: null
      })
      .returning()
      .execute();

    const workspaceId = workspaceResult[0].id;

    const result = await getTasks(workspaceId);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array when filtering by status with no matches', async () => {
    // Create user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: userId,
        name: 'Test Workspace',
        settings: null
      })
      .returning()
      .execute();

    const workspaceId = workspaceResult[0].id;

    // Create only 'todo' tasks
    await db.insert(tasksTable)
      .values([
        {
          workspace_id: workspaceId,
          title: 'Todo Task 1',
          description: 'First todo task',
          status: 'todo',
          priority: 'med',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        },
        {
          workspace_id: workspaceId,
          title: 'Todo Task 2',
          description: 'Second todo task',
          status: 'todo',
          priority: 'med',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        }
      ])
      .execute();

    // Filter by 'done' status - should return empty array
    const doneTasks = await getTasks(workspaceId, 'done');
    expect(doneTasks).toHaveLength(0);
    expect(Array.isArray(doneTasks)).toBe(true);
  });

  it('should only return tasks from specified workspace', async () => {
    // Create user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create two workspaces
    const workspace1Result = await db.insert(workspacesTable)
      .values({
        owner_id: userId,
        name: 'Workspace 1',
        settings: null
      })
      .returning()
      .execute();

    const workspace2Result = await db.insert(workspacesTable)
      .values({
        owner_id: userId,
        name: 'Workspace 2',
        settings: null
      })
      .returning()
      .execute();

    const workspace1Id = workspace1Result[0].id;
    const workspace2Id = workspace2Result[0].id;

    // Create tasks in both workspaces
    await db.insert(tasksTable)
      .values([
        {
          workspace_id: workspace1Id,
          title: 'Workspace 1 Task',
          description: 'Task in first workspace',
          status: 'todo',
          priority: 'med',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        },
        {
          workspace_id: workspace2Id,
          title: 'Workspace 2 Task',
          description: 'Task in second workspace',
          status: 'todo',
          priority: 'med',
          due_at: null,
          assignee_id: userId,
          linked_note_id: null
        }
      ])
      .execute();

    // Get tasks from workspace 1 only
    const workspace1Tasks = await getTasks(workspace1Id);
    expect(workspace1Tasks).toHaveLength(1);
    expect(workspace1Tasks[0].title).toEqual('Workspace 1 Task');
    expect(workspace1Tasks[0].workspace_id).toEqual(workspace1Id);

    // Get tasks from workspace 2 only
    const workspace2Tasks = await getTasks(workspace2Id);
    expect(workspace2Tasks).toHaveLength(1);
    expect(workspace2Tasks[0].title).toEqual('Workspace 2 Task');
    expect(workspace2Tasks[0].workspace_id).toEqual(workspace2Id);
  });

  it('should save tasks to database correctly', async () => {
    // Create user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: userId,
        name: 'Test Workspace',
        settings: null
      })
      .returning()
      .execute();

    const workspaceId = workspaceResult[0].id;

    // Create task
    const taskResult = await db.insert(tasksTable)
      .values({
        workspace_id: workspaceId,
        title: 'Test Task',
        description: 'A task for testing',
        status: 'todo',
        priority: 'high',
        due_at: null,
        assignee_id: userId,
        linked_note_id: null
      })
      .returning()
      .execute();

    const taskId = taskResult[0].id;

    // Get tasks via handler
    const handlerResult = await getTasks(workspaceId);

    // Verify via direct database query
    const dbTasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.workspace_id, workspaceId))
      .execute();

    expect(dbTasks).toHaveLength(1);
    expect(dbTasks[0].id).toEqual(taskId);
    expect(dbTasks[0].title).toEqual('Test Task');
    expect(dbTasks[0].status).toEqual('todo');
    expect(dbTasks[0].priority).toEqual('high');

    // Verify handler returns same data
    expect(handlerResult).toHaveLength(1);
    expect(handlerResult[0].id).toEqual(taskId);
    expect(handlerResult[0].title).toEqual('Test Task');
    expect(handlerResult[0].status).toEqual('todo');
    expect(handlerResult[0].priority).toEqual('high');
  });
});