import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, agentEventsTable } from '../db/schema';
import { type AgentProposeInput } from '../schema';
import { agentPropose } from '../handlers/agent_propose';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'test@example.com',
  display_name: 'Test User',
  timezone: 'America/New_York',
  llm_provider: 'openai',
  llm_model: 'gpt-4'
};

const testWorkspace = {
  name: 'Test Workspace',
  settings: { theme: 'dark' }
};

describe('agentPropose', () => {
  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        ...testWorkspace,
        owner_id: userId
      })
      .returning()
      .execute();
    workspaceId = workspaceResult[0].id;
  });

  afterEach(resetDB);

  it('should create agent event with NoteTakingAgent action', async () => {
    const input: AgentProposeInput = {
      agent: 'NoteTakingAgent',
      input_json: {
        title: 'Meeting Notes',
        content: 'Discussion about project updates'
      }
    };

    const result = await agentPropose(input, workspaceId);

    expect(result.workspace_id).toEqual(workspaceId);
    expect(result.agent).toEqual('NoteTakingAgent');
    expect(result.action).toEqual('create_note');
    expect(result.input).toEqual(input.input_json);
    expect(result.output).toBeNull();
    expect(result.status).toEqual('draft');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create agent event with TaskAgent action', async () => {
    const input: AgentProposeInput = {
      agent: 'TaskAgent',
      input_json: {
        title: 'Complete project review',
        priority: 'high',
        due_date: '2024-01-15'
      }
    };

    const result = await agentPropose(input, workspaceId);

    expect(result.agent).toEqual('TaskAgent');
    expect(result.action).toEqual('create_task');
    expect(result.input).toEqual(input.input_json);
    expect(result.status).toEqual('draft');
  });

  it('should create agent event with SchedulerAgent action', async () => {
    const input: AgentProposeInput = {
      agent: 'SchedulerAgent',
      input_json: {
        title: 'Team Standup',
        start_time: '2024-01-15T09:00:00Z',
        duration: 30
      }
    };

    const result = await agentPropose(input, workspaceId);

    expect(result.agent).toEqual('SchedulerAgent');
    expect(result.action).toEqual('create_calendar_event');
    expect(result.input).toEqual(input.input_json);
    expect(result.status).toEqual('draft');
  });

  it('should create agent event with KnowledgeAgent action', async () => {
    const input: AgentProposeInput = {
      agent: 'KnowledgeAgent',
      input_json: {
        document: 'Technical specification document',
        extract_entities: ['technologies', 'requirements']
      }
    };

    const result = await agentPropose(input, workspaceId);

    expect(result.agent).toEqual('KnowledgeAgent');
    expect(result.action).toEqual('extract_knowledge');
    expect(result.input).toEqual(input.input_json);
    expect(result.status).toEqual('draft');
  });

  it('should use generic action for unknown agent types', async () => {
    const input: AgentProposeInput = {
      agent: 'CustomAgent',
      input_json: {
        custom_data: 'Some custom action data'
      }
    };

    const result = await agentPropose(input, workspaceId);

    expect(result.agent).toEqual('CustomAgent');
    expect(result.action).toEqual('propose_action');
    expect(result.input).toEqual(input.input_json);
    expect(result.status).toEqual('draft');
  });

  it('should save agent event to database', async () => {
    const input: AgentProposeInput = {
      agent: 'TaskAgent',
      input_json: {
        title: 'Database test task',
        description: 'Verify task creation works'
      }
    };

    const result = await agentPropose(input, workspaceId);

    // Query database to verify the record was saved
    const savedEvents = await db.select()
      .from(agentEventsTable)
      .where(eq(agentEventsTable.id, result.id))
      .execute();

    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].workspace_id).toEqual(workspaceId);
    expect(savedEvents[0].agent).toEqual('TaskAgent');
    expect(savedEvents[0].action).toEqual('create_task');
    expect(savedEvents[0].input).toEqual(input.input_json);
    expect(savedEvents[0].output).toBeNull();
    expect(savedEvents[0].status).toEqual('draft');
    expect(savedEvents[0].created_at).toBeInstanceOf(Date);
  });

  it('should handle complex input JSON structures', async () => {
    const complexInput = {
      nested: {
        data: 'value',
        array: [1, 2, 3],
        boolean: true
      },
      metadata: {
        source: 'api',
        version: '1.0'
      }
    };

    const input: AgentProposeInput = {
      agent: 'NoteTakingAgent',
      input_json: complexInput
    };

    const result = await agentPropose(input, workspaceId);

    expect(result.input).toEqual(complexInput);
    
    // Verify the complex JSON was properly stored in the database
    const savedEvents = await db.select()
      .from(agentEventsTable)
      .where(eq(agentEventsTable.id, result.id))
      .execute();

    expect(savedEvents[0].input).toEqual(complexInput);
  });

  it('should create multiple agent events for same workspace', async () => {
    const input1: AgentProposeInput = {
      agent: 'NoteTakingAgent',
      input_json: { title: 'First note' }
    };

    const input2: AgentProposeInput = {
      agent: 'TaskAgent',
      input_json: { title: 'First task' }
    };

    const result1 = await agentPropose(input1, workspaceId);
    const result2 = await agentPropose(input2, workspaceId);

    // Verify both events were created with different IDs
    expect(result1.id).not.toEqual(result2.id);
    expect(result1.workspace_id).toEqual(workspaceId);
    expect(result2.workspace_id).toEqual(workspaceId);

    // Verify both are in database
    const allEvents = await db.select()
      .from(agentEventsTable)
      .where(eq(agentEventsTable.workspace_id, workspaceId))
      .execute();

    expect(allEvents).toHaveLength(2);
  });
});