import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, tasksTable, remindersTable } from '../db/schema';
import { type CreateUserInput, type CreateWorkspaceInput, type CreateTaskInput, type CreateReminderInput } from '../schema';
import { getReminders } from '../handlers/get_reminders';
import { eq } from 'drizzle-orm';

// Test data
const testUser: CreateUserInput = {
  email: 'test@example.com',
  display_name: 'Test User',
  timezone: 'Australia/Adelaide',
  llm_provider: 'openai',
  llm_model: 'gpt-4.1'
};

const testWorkspace: CreateWorkspaceInput = {
  name: 'Test Workspace',
  owner_id: '', // Will be set after user creation
  settings: null
};

const testTask: CreateTaskInput = {
  workspace_id: '', // Will be set after workspace creation
  title: 'Test Task',
  description: 'A task for testing reminders',
  priority: 'med',
  assignee_id: '', // Will be set after user creation
  due_at: new Date('2024-01-15T10:00:00Z'),
  linked_note_id: null
};

const testReminder: CreateReminderInput = {
  task_id: '', // Will be set after task creation
  remind_at: new Date('2024-01-14T09:00:00Z'),
  method: 'app_push'
};

describe('getReminders', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get all reminders when no taskId is provided', async () => {
    // Create prerequisite data
    const userResult = await db.insert(usersTable)
      .values({
        email: testUser.email,
        display_name: testUser.display_name,
        timezone: testUser.timezone,
        llm_provider: testUser.llm_provider,
        llm_model: testUser.llm_model
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    const workspaceResult = await db.insert(workspacesTable)
      .values({
        name: testWorkspace.name,
        owner_id: userId,
        settings: testWorkspace.settings
      })
      .returning()
      .execute();
    const workspaceId = workspaceResult[0].id;

    // Create two tasks
    const taskResult1 = await db.insert(tasksTable)
      .values({
        workspace_id: workspaceId,
        title: 'Task 1',
        description: testTask.description,
        priority: testTask.priority,
        assignee_id: userId,
        due_at: testTask.due_at,
        linked_note_id: testTask.linked_note_id
      })
      .returning()
      .execute();
    const taskId1 = taskResult1[0].id;

    const taskResult2 = await db.insert(tasksTable)
      .values({
        workspace_id: workspaceId,
        title: 'Task 2',
        description: testTask.description,
        priority: testTask.priority,
        assignee_id: userId,
        due_at: testTask.due_at,
        linked_note_id: testTask.linked_note_id
      })
      .returning()
      .execute();
    const taskId2 = taskResult2[0].id;

    // Create reminders for both tasks
    await db.insert(remindersTable)
      .values([
        {
          task_id: taskId1,
          remind_at: testReminder.remind_at,
          method: testReminder.method
        },
        {
          task_id: taskId2,
          remind_at: new Date('2024-01-14T11:00:00Z'),
          method: 'email'
        }
      ])
      .execute();

    const result = await getReminders();

    expect(result).toHaveLength(2);
    expect(result[0].task_id).toBeDefined();
    expect(result[0].remind_at).toBeInstanceOf(Date);
    expect(result[0].method).toBeDefined();
    expect(result[0].status).toEqual('scheduled'); // Default status
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].id).toBeDefined();

    // Verify we got reminders for both tasks
    const taskIds = result.map(r => r.task_id);
    expect(taskIds).toContain(taskId1);
    expect(taskIds).toContain(taskId2);
  });

  it('should get reminders filtered by taskId', async () => {
    // Create prerequisite data
    const userResult = await db.insert(usersTable)
      .values({
        email: testUser.email,
        display_name: testUser.display_name,
        timezone: testUser.timezone,
        llm_provider: testUser.llm_provider,
        llm_model: testUser.llm_model
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    const workspaceResult = await db.insert(workspacesTable)
      .values({
        name: testWorkspace.name,
        owner_id: userId,
        settings: testWorkspace.settings
      })
      .returning()
      .execute();
    const workspaceId = workspaceResult[0].id;

    // Create two tasks
    const taskResult1 = await db.insert(tasksTable)
      .values({
        workspace_id: workspaceId,
        title: 'Target Task',
        description: testTask.description,
        priority: testTask.priority,
        assignee_id: userId,
        due_at: testTask.due_at,
        linked_note_id: testTask.linked_note_id
      })
      .returning()
      .execute();
    const taskId1 = taskResult1[0].id;

    const taskResult2 = await db.insert(tasksTable)
      .values({
        workspace_id: workspaceId,
        title: 'Other Task',
        description: testTask.description,
        priority: testTask.priority,
        assignee_id: userId,
        due_at: testTask.due_at,
        linked_note_id: testTask.linked_note_id
      })
      .returning()
      .execute();
    const taskId2 = taskResult2[0].id;

    // Create reminders for both tasks
    await db.insert(remindersTable)
      .values([
        {
          task_id: taskId1,
          remind_at: testReminder.remind_at,
          method: testReminder.method
        },
        {
          task_id: taskId2,
          remind_at: new Date('2024-01-14T11:00:00Z'),
          method: 'email'
        }
      ])
      .execute();

    const result = await getReminders(taskId1);

    expect(result).toHaveLength(1);
    expect(result[0].task_id).toEqual(taskId1);
    expect(result[0].remind_at).toEqual(testReminder.remind_at);
    expect(result[0].method).toEqual(testReminder.method);
    expect(result[0].status).toEqual('scheduled');
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].id).toBeDefined();
  });

  it('should return empty array when no reminders exist', async () => {
    const result = await getReminders();

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array when filtering by non-existent taskId', async () => {
    // Create prerequisite data with reminders
    const userResult = await db.insert(usersTable)
      .values({
        email: testUser.email,
        display_name: testUser.display_name,
        timezone: testUser.timezone,
        llm_provider: testUser.llm_provider,
        llm_model: testUser.llm_model
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    const workspaceResult = await db.insert(workspacesTable)
      .values({
        name: testWorkspace.name,
        owner_id: userId,
        settings: testWorkspace.settings
      })
      .returning()
      .execute();
    const workspaceId = workspaceResult[0].id;

    const taskResult = await db.insert(tasksTable)
      .values({
        workspace_id: workspaceId,
        title: testTask.title,
        description: testTask.description,
        priority: testTask.priority,
        assignee_id: userId,
        due_at: testTask.due_at,
        linked_note_id: testTask.linked_note_id
      })
      .returning()
      .execute();
    const taskId = taskResult[0].id;

    await db.insert(remindersTable)
      .values({
        task_id: taskId,
        remind_at: testReminder.remind_at,
        method: testReminder.method
      })
      .execute();

    // Filter by non-existent task ID (using valid UUID format)
    const result = await getReminders('123e4567-e89b-12d3-a456-426614174000');

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should save reminder to database correctly', async () => {
    // Create prerequisite data
    const userResult = await db.insert(usersTable)
      .values({
        email: testUser.email,
        display_name: testUser.display_name,
        timezone: testUser.timezone,
        llm_provider: testUser.llm_provider,
        llm_model: testUser.llm_model
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    const workspaceResult = await db.insert(workspacesTable)
      .values({
        name: testWorkspace.name,
        owner_id: userId,
        settings: testWorkspace.settings
      })
      .returning()
      .execute();
    const workspaceId = workspaceResult[0].id;

    const taskResult = await db.insert(tasksTable)
      .values({
        workspace_id: workspaceId,
        title: testTask.title,
        description: testTask.description,
        priority: testTask.priority,
        assignee_id: userId,
        due_at: testTask.due_at,
        linked_note_id: testTask.linked_note_id
      })
      .returning()
      .execute();
    const taskId = taskResult[0].id;

    await db.insert(remindersTable)
      .values({
        task_id: taskId,
        remind_at: testReminder.remind_at,
        method: testReminder.method
      })
      .execute();

    const result = await getReminders(taskId);

    // Verify database contains the reminder
    const dbReminders = await db.select()
      .from(remindersTable)
      .where(eq(remindersTable.task_id, taskId))
      .execute();

    expect(dbReminders).toHaveLength(1);
    expect(dbReminders[0].task_id).toEqual(taskId);
    expect(dbReminders[0].remind_at).toEqual(testReminder.remind_at);
    expect(dbReminders[0].method).toEqual(testReminder.method);
    expect(dbReminders[0].status).toEqual('scheduled');

    // Verify handler returns the same data
    expect(result[0].task_id).toEqual(dbReminders[0].task_id);
    expect(result[0].remind_at).toEqual(dbReminders[0].remind_at);
    expect(result[0].method).toEqual(dbReminders[0].method);
    expect(result[0].status).toEqual(dbReminders[0].status);
  });

  it('should handle different reminder methods and statuses', async () => {
    // Create prerequisite data
    const userResult = await db.insert(usersTable)
      .values({
        email: testUser.email,
        display_name: testUser.display_name,
        timezone: testUser.timezone,
        llm_provider: testUser.llm_provider,
        llm_model: testUser.llm_model
      })
      .returning()
      .execute();
    const userId = userResult[0].id;

    const workspaceResult = await db.insert(workspacesTable)
      .values({
        name: testWorkspace.name,
        owner_id: userId,
        settings: testWorkspace.settings
      })
      .returning()
      .execute();
    const workspaceId = workspaceResult[0].id;

    const taskResult = await db.insert(tasksTable)
      .values({
        workspace_id: workspaceId,
        title: testTask.title,
        description: testTask.description,
        priority: testTask.priority,
        assignee_id: userId,
        due_at: testTask.due_at,
        linked_note_id: testTask.linked_note_id
      })
      .returning()
      .execute();
    const taskId = taskResult[0].id;

    // Create reminders with different methods and statuses
    await db.insert(remindersTable)
      .values([
        {
          task_id: taskId,
          remind_at: new Date('2024-01-14T09:00:00Z'),
          method: 'app_push',
          status: 'scheduled'
        },
        {
          task_id: taskId,
          remind_at: new Date('2024-01-14T10:00:00Z'),
          method: 'email',
          status: 'sent'
        },
        {
          task_id: taskId,
          remind_at: new Date('2024-01-14T11:00:00Z'),
          method: 'calendar',
          status: 'cancelled'
        }
      ])
      .execute();

    const result = await getReminders(taskId);

    expect(result).toHaveLength(3);
    
    const methods = result.map(r => r.method);
    const statuses = result.map(r => r.status);
    
    expect(methods).toContain('app_push');
    expect(methods).toContain('email');
    expect(methods).toContain('calendar');
    
    expect(statuses).toContain('scheduled');
    expect(statuses).toContain('sent');
    expect(statuses).toContain('cancelled');
  });
});