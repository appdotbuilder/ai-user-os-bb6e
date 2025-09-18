import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, agentEventsTable } from '../db/schema';
import { type CreateAgentEventInput } from '../schema';
import { createAgentEvent } from '../handlers/create_agent_event';
import { eq } from 'drizzle-orm';

describe('createAgentEvent', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Create test workspace first
  const setupTestData = async () => {
    // Create a test user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User'
      })
      .returning()
      .execute();

    // Create a test workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: userResult[0].id,
        name: 'Test Workspace'
      })
      .returning()
      .execute();

    return { user: userResult[0], workspace: workspaceResult[0] };
  };

  it('should create an agent event with minimal data', async () => {
    const { workspace } = await setupTestData();

    const testInput: CreateAgentEventInput = {
      workspace_id: workspace.id,
      agent: 'calendar_agent',
      action: 'create_meeting',
      status: 'draft'
    };

    const result = await createAgentEvent(testInput);

    // Verify returned fields
    expect(result.id).toBeDefined();
    expect(result.workspace_id).toEqual(workspace.id);
    expect(result.agent).toEqual('calendar_agent');
    expect(result.action).toEqual('create_meeting');
    expect(result.input).toBeNull();
    expect(result.output).toBeNull();
    expect(result.status).toEqual('draft'); // Default from schema
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create an agent event with full data', async () => {
    const { workspace } = await setupTestData();

    const testInput: CreateAgentEventInput = {
      workspace_id: workspace.id,
      agent: 'task_agent',
      action: 'create_task',
      input: { title: 'New Task', priority: 'high' },
      output: { task_id: 'task-123' },
      status: 'awaiting_confirmation'
    };

    const result = await createAgentEvent(testInput);

    // Verify all fields
    expect(result.id).toBeDefined();
    expect(result.workspace_id).toEqual(workspace.id);
    expect(result.agent).toEqual('task_agent');
    expect(result.action).toEqual('create_task');
    expect(result.input).toEqual({ title: 'New Task', priority: 'high' });
    expect(result.output).toEqual({ task_id: 'task-123' });
    expect(result.status).toEqual('awaiting_confirmation');
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save agent event to database', async () => {
    const { workspace } = await setupTestData();

    const testInput: CreateAgentEventInput = {
      workspace_id: workspace.id,
      agent: 'email_agent',
      action: 'send_notification',
      input: { recipient: 'user@example.com', subject: 'Test' },
      status: 'draft'
    };

    const result = await createAgentEvent(testInput);

    // Verify it was saved to database
    const savedEvents = await db.select()
      .from(agentEventsTable)
      .where(eq(agentEventsTable.id, result.id))
      .execute();

    expect(savedEvents).toHaveLength(1);
    const savedEvent = savedEvents[0];
    
    expect(savedEvent.workspace_id).toEqual(workspace.id);
    expect(savedEvent.agent).toEqual('email_agent');
    expect(savedEvent.action).toEqual('send_notification');
    expect(savedEvent.input).toEqual({ recipient: 'user@example.com', subject: 'Test' });
    expect(savedEvent.output).toBeNull();
    expect(savedEvent.status).toEqual('draft');
    expect(savedEvent.created_at).toBeInstanceOf(Date);
  });

  it('should handle complex input/output data structures', async () => {
    const { workspace } = await setupTestData();

    const complexInput = {
      calendar_event: {
        title: 'Team Meeting',
        start: '2024-01-15T10:00:00Z',
        end: '2024-01-15T11:00:00Z',
        attendees: ['user1@example.com', 'user2@example.com'],
        location: 'Conference Room A'
      },
      options: {
        send_invites: true,
        recurring: false
      }
    };

    const complexOutput = {
      event_id: 'cal-event-456',
      confirmation_url: 'https://example.com/confirm/456',
      invites_sent: 2
    };

    const testInput: CreateAgentEventInput = {
      workspace_id: workspace.id,
      agent: 'calendar_agent',
      action: 'schedule_meeting',
      input: complexInput,
      output: complexOutput,
      status: 'executed'
    };

    const result = await createAgentEvent(testInput);

    expect(result.input).toEqual(complexInput);
    expect(result.output).toEqual(complexOutput);
    expect(result.status).toEqual('executed');
  });

  it('should handle null input and output gracefully', async () => {
    const { workspace } = await setupTestData();

    const testInput: CreateAgentEventInput = {
      workspace_id: workspace.id,
      agent: 'system_agent',
      action: 'health_check',
      input: null,
      output: null,
      status: 'draft'
    };

    const result = await createAgentEvent(testInput);

    expect(result.input).toBeNull();
    expect(result.output).toBeNull();
    expect(result.agent).toEqual('system_agent');
    expect(result.action).toEqual('health_check');
  });

  it('should fail when workspace does not exist', async () => {
    const testInput: CreateAgentEventInput = {
      workspace_id: '11111111-1111-1111-1111-111111111111', // Non-existent workspace
      agent: 'test_agent',
      action: 'test_action',
      status: 'draft'
    };

    await expect(createAgentEvent(testInput)).rejects.toThrow(/violates foreign key constraint/i);
  });
});