import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, agentEventsTable } from '../db/schema';
import { type CreateUserInput, type CreateWorkspaceInput, type CreateAgentEventInput } from '../schema';
import { getAgentEvents } from '../handlers/get_agent_events';

// Test data setup
const testUser: CreateUserInput = {
  email: 'test@example.com',
  display_name: 'Test User',
  timezone: 'Australia/Adelaide',
  llm_provider: 'openai',
  llm_model: 'gpt-4.1'
};

const testWorkspace: CreateWorkspaceInput = {
  owner_id: '', // Will be set after user creation
  name: 'Test Workspace'
};

const testAgentEvent1: CreateAgentEventInput = {
  workspace_id: '', // Will be set after workspace creation
  agent: 'calendar',
  action: 'create_event',
  input: { title: 'Meeting', start: '2024-01-15T10:00:00Z' },
  output: { event_id: 'cal123' },
  status: 'executed'
};

const testAgentEvent2: CreateAgentEventInput = {
  workspace_id: '', // Will be set after workspace creation
  agent: 'task_manager',
  action: 'create_task',
  input: { title: 'Follow up', priority: 'high' },
  status: 'draft'
};

const testAgentEvent3: CreateAgentEventInput = {
  workspace_id: '', // Will be set after workspace creation
  agent: 'note_processor',
  action: 'summarize',
  input: { note_id: 'note123' },
  output: { summary: 'Meeting summary' },
  status: 'awaiting_confirmation'
};

describe('getAgentEvents', () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test workspaces
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        ...testWorkspace,
        owner_id: userId
      })
      .returning()
      .execute();
    workspaceId = workspaceResult[0].id;

    const otherWorkspaceResult = await db.insert(workspacesTable)
      .values({
        ...testWorkspace,
        name: 'Other Workspace',
        owner_id: userId
      })
      .returning()
      .execute();
    otherWorkspaceId = otherWorkspaceResult[0].id;

    // Create test agent events
    await db.insert(agentEventsTable)
      .values([
        {
          ...testAgentEvent1,
          workspace_id: workspaceId
        },
        {
          ...testAgentEvent2,
          workspace_id: workspaceId
        },
        {
          ...testAgentEvent3,
          workspace_id: workspaceId
        },
        // Event in different workspace (should not be returned)
        {
          workspace_id: otherWorkspaceId,
          agent: 'other_agent',
          action: 'other_action',
          status: 'executed'
        }
      ])
      .execute();
  });

  afterEach(resetDB);

  it('should get all agent events for a workspace', async () => {
    const result = await getAgentEvents(workspaceId);

    expect(result).toHaveLength(3);
    
    // Check that all events belong to the correct workspace
    result.forEach(event => {
      expect(event.workspace_id).toEqual(workspaceId);
    });

    // Check that results are ordered by created_at descending (most recent first)
    for (let i = 1; i < result.length; i++) {
      expect(result[i-1].created_at >= result[i].created_at).toBe(true);
    }

    // Verify specific event data
    const calendarEvent = result.find(e => e.agent === 'calendar');
    expect(calendarEvent).toBeDefined();
    expect(calendarEvent!.action).toEqual('create_event');
    expect(calendarEvent!.status).toEqual('executed');
    expect(calendarEvent!.input).toEqual({ title: 'Meeting', start: '2024-01-15T10:00:00Z' });
    expect(calendarEvent!.output).toEqual({ event_id: 'cal123' });

    const taskEvent = result.find(e => e.agent === 'task_manager');
    expect(taskEvent).toBeDefined();
    expect(taskEvent!.action).toEqual('create_task');
    expect(taskEvent!.status).toEqual('draft');
    expect(taskEvent!.input).toEqual({ title: 'Follow up', priority: 'high' });

    const noteEvent = result.find(e => e.agent === 'note_processor');
    expect(noteEvent).toBeDefined();
    expect(noteEvent!.action).toEqual('summarize');
    expect(noteEvent!.status).toEqual('awaiting_confirmation');
  });

  it('should filter agent events by status', async () => {
    const draftEvents = await getAgentEvents(workspaceId, 'draft');
    
    expect(draftEvents).toHaveLength(1);
    expect(draftEvents[0].status).toEqual('draft');
    expect(draftEvents[0].agent).toEqual('task_manager');

    const executedEvents = await getAgentEvents(workspaceId, 'executed');
    
    expect(executedEvents).toHaveLength(1);
    expect(executedEvents[0].status).toEqual('executed');
    expect(executedEvents[0].agent).toEqual('calendar');

    const awaitingEvents = await getAgentEvents(workspaceId, 'awaiting_confirmation');
    
    expect(awaitingEvents).toHaveLength(1);
    expect(awaitingEvents[0].status).toEqual('awaiting_confirmation');
    expect(awaitingEvents[0].agent).toEqual('note_processor');
  });

  it('should return empty array for non-existent workspace', async () => {
    const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';
    const result = await getAgentEvents(nonExistentId);

    expect(result).toHaveLength(0);
  });

  it('should return empty array when filtering by status with no matches', async () => {
    const errorEvents = await getAgentEvents(workspaceId, 'error');

    expect(errorEvents).toHaveLength(0);
  });

  it('should not return events from other workspaces', async () => {
    const result = await getAgentEvents(workspaceId);

    // Should only return events from the specified workspace
    expect(result).toHaveLength(3);
    result.forEach(event => {
      expect(event.workspace_id).toEqual(workspaceId);
      expect(event.workspace_id).not.toEqual(otherWorkspaceId);
    });

    // Verify other workspace has its own events
    const otherResult = await getAgentEvents(otherWorkspaceId);
    expect(otherResult).toHaveLength(1);
    expect(otherResult[0].workspace_id).toEqual(otherWorkspaceId);
    expect(otherResult[0].agent).toEqual('other_agent');
  });

  it('should handle workspace with no agent events', async () => {
    // Create a new workspace with no events
    const emptyWorkspaceResult = await db.insert(workspacesTable)
      .values({
        name: 'Empty Workspace',
        owner_id: userId
      })
      .returning()
      .execute();
    
    const result = await getAgentEvents(emptyWorkspaceResult[0].id);

    expect(result).toHaveLength(0);
  });
});