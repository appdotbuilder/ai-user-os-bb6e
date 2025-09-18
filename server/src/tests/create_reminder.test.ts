import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { remindersTable, usersTable, workspacesTable, tasksTable } from '../db/schema';
import { type CreateReminderInput } from '../schema';
import { createReminder } from '../handlers/create_reminder';
import { eq } from 'drizzle-orm';

describe('createReminder', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a reminder with default method', async () => {
    // Create prerequisite data
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    const workspace = await db.insert(workspacesTable)
      .values({
        owner_id: user[0].id,
        name: 'Test Workspace'
      })
      .returning()
      .execute();

    const task = await db.insert(tasksTable)
      .values({
        workspace_id: workspace[0].id,
        title: 'Test Task',
        assignee_id: user[0].id
      })
      .returning()
      .execute();

    const remindAt = new Date('2024-12-31T09:00:00Z');
    const testInput: CreateReminderInput = {
      task_id: task[0].id,
      remind_at: remindAt,
      method: 'app_push'
    };

    const result = await createReminder(testInput);

    // Basic field validation
    expect(result.task_id).toEqual(task[0].id);
    expect(result.remind_at).toEqual(remindAt);
    expect(result.method).toEqual('app_push');
    expect(result.status).toEqual('scheduled'); // Default status
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create reminder with email method', async () => {
    // Create prerequisite data
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User'
      })
      .returning()
      .execute();

    const workspace = await db.insert(workspacesTable)
      .values({
        owner_id: user[0].id,
        name: 'Test Workspace'
      })
      .returning()
      .execute();

    const task = await db.insert(tasksTable)
      .values({
        workspace_id: workspace[0].id,
        title: 'Email Reminder Task',
        assignee_id: user[0].id
      })
      .returning()
      .execute();

    const testInput: CreateReminderInput = {
      task_id: task[0].id,
      remind_at: new Date('2024-12-25T14:30:00Z'),
      method: 'email'
    };

    const result = await createReminder(testInput);

    expect(result.method).toEqual('email');
    expect(result.status).toEqual('scheduled');
  });

  it('should save reminder to database', async () => {
    // Create prerequisite data
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User'
      })
      .returning()
      .execute();

    const workspace = await db.insert(workspacesTable)
      .values({
        owner_id: user[0].id,
        name: 'Test Workspace'
      })
      .returning()
      .execute();

    const task = await db.insert(tasksTable)
      .values({
        workspace_id: workspace[0].id,
        title: 'Database Test Task',
        assignee_id: user[0].id
      })
      .returning()
      .execute();

    const testInput: CreateReminderInput = {
      task_id: task[0].id,
      remind_at: new Date('2024-11-15T16:45:00Z'),
      method: 'calendar'
    };

    const result = await createReminder(testInput);

    // Query using proper drizzle syntax
    const reminders = await db.select()
      .from(remindersTable)
      .where(eq(remindersTable.id, result.id))
      .execute();

    expect(reminders).toHaveLength(1);
    expect(reminders[0].task_id).toEqual(task[0].id);
    expect(reminders[0].method).toEqual('calendar');
    expect(reminders[0].status).toEqual('scheduled');
    expect(reminders[0].created_at).toBeInstanceOf(Date);
  });

  it('should handle foreign key constraint for invalid task_id', async () => {
    const testInput: CreateReminderInput = {
      task_id: '99999999-9999-9999-9999-999999999999',
      remind_at: new Date('2024-12-01T10:00:00Z'),
      method: 'app_push'
    };

    await expect(createReminder(testInput)).rejects.toThrow(/violates foreign key constraint/i);
  });
});