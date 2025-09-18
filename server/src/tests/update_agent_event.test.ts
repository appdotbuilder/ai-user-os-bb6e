import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, agentEventsTable } from '../db/schema';
import { type UpdateAgentEventInput, type CreateUserInput, type CreateWorkspaceInput } from '../schema';
import { updateAgentEvent } from '../handlers/update_agent_event';
import { eq } from 'drizzle-orm';

describe('updateAgentEvent', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let userId: string;
  let workspaceId: string;
  let agentEventId: string;

  // Create test prerequisites before each test
  beforeEach(async () => {
    // Create test user
    const testUser: CreateUserInput = {
      email: 'test@example.com',
      display_name: 'Test User',
      timezone: 'Australia/Adelaide',
      llm_provider: 'openai',
      llm_model: 'gpt-4.1'
    };

    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test workspace
    const testWorkspace: CreateWorkspaceInput = {
      owner_id: userId,
      name: 'Test Workspace',
      settings: null
    };

    const workspaceResult = await db.insert(workspacesTable)
      .values(testWorkspace)
      .returning()
      .execute();
    workspaceId = workspaceResult[0].id;

    // Create test agent event
    const agentEventResult = await db.insert(agentEventsTable)
      .values({
        workspace_id: workspaceId,
        agent: 'TaskAgent',
        action: 'create_task',
        input: { title: 'Test Task' },
        output: null,
        status: 'draft'
      })
      .returning()
      .execute();
    agentEventId = agentEventResult[0].id;
  });

  it('should update agent event status only', async () => {
    const input: UpdateAgentEventInput = {
      id: agentEventId,
      status: 'executed'
    };

    const result = await updateAgentEvent(input);

    expect(result.id).toEqual(agentEventId);
    expect(result.status).toEqual('executed');
    expect(result.output).toBeNull(); // Should remain unchanged
    expect(result.agent).toEqual('TaskAgent');
    expect(result.action).toEqual('create_task');
    expect(result.workspace_id).toEqual(workspaceId);
  });

  it('should update agent event output only', async () => {
    const outputData = { task_id: 'new-task-123', success: true };
    const input: UpdateAgentEventInput = {
      id: agentEventId,
      output: outputData
    };

    const result = await updateAgentEvent(input);

    expect(result.id).toEqual(agentEventId);
    expect(result.output).toEqual(outputData);
    expect(result.status).toEqual('draft'); // Should remain unchanged
    expect(result.agent).toEqual('TaskAgent');
    expect(result.action).toEqual('create_task');
  });

  it('should update both status and output', async () => {
    const outputData = { task_id: 'task-456', error: 'Task creation failed' };
    const input: UpdateAgentEventInput = {
      id: agentEventId,
      status: 'error',
      output: outputData
    };

    const result = await updateAgentEvent(input);

    expect(result.id).toEqual(agentEventId);
    expect(result.status).toEqual('error');
    expect(result.output).toEqual(outputData);
    expect(result.agent).toEqual('TaskAgent');
    expect(result.action).toEqual('create_task');
    expect(result.workspace_id).toEqual(workspaceId);
  });

  it('should update output to null', async () => {
    // First set some output data
    await db.update(agentEventsTable)
      .set({ output: { temp: 'data' } })
      .where(eq(agentEventsTable.id, agentEventId))
      .execute();

    const input: UpdateAgentEventInput = {
      id: agentEventId,
      output: null
    };

    const result = await updateAgentEvent(input);

    expect(result.id).toEqual(agentEventId);
    expect(result.output).toBeNull();
    expect(result.status).toEqual('draft'); // Should remain unchanged
  });

  it('should save changes to database', async () => {
    const outputData = { result: 'task_created', task_id: 'abc-123' };
    const input: UpdateAgentEventInput = {
      id: agentEventId,
      status: 'executed',
      output: outputData
    };

    await updateAgentEvent(input);

    // Verify changes were persisted in database
    const agentEvents = await db.select()
      .from(agentEventsTable)
      .where(eq(agentEventsTable.id, agentEventId))
      .execute();

    expect(agentEvents).toHaveLength(1);
    expect(agentEvents[0].status).toEqual('executed');
    expect(agentEvents[0].output).toEqual(outputData);
    expect(agentEvents[0].agent).toEqual('TaskAgent');
    expect(agentEvents[0].action).toEqual('create_task');
  });

  it('should handle awaiting_confirmation status', async () => {
    const input: UpdateAgentEventInput = {
      id: agentEventId,
      status: 'awaiting_confirmation'
    };

    const result = await updateAgentEvent(input);

    expect(result.status).toEqual('awaiting_confirmation');
    expect(result.id).toEqual(agentEventId);
  });

  it('should throw error for non-existent agent event', async () => {
    const input: UpdateAgentEventInput = {
      id: '00000000-0000-0000-0000-000000000000',
      status: 'executed'
    };

    await expect(updateAgentEvent(input)).rejects.toThrow(/Agent event with id .* not found/i);
  });

  it('should handle complex output data structures', async () => {
    const complexOutput = {
      tasks: [
        { id: 'task1', title: 'Task 1', status: 'created' },
        { id: 'task2', title: 'Task 2', status: 'created' }
      ],
      metadata: {
        created_count: 2,
        timestamp: new Date().toISOString(),
        agent_version: '1.0'
      },
      errors: []
    };

    const input: UpdateAgentEventInput = {
      id: agentEventId,
      status: 'executed',
      output: complexOutput
    };

    const result = await updateAgentEvent(input);

    expect(result.output).toEqual(complexOutput);
    expect(result.status).toEqual('executed');
  });
});