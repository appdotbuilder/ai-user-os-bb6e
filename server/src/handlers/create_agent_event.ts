import { db } from '../db';
import { agentEventsTable } from '../db/schema';
import { type CreateAgentEventInput, type AgentEvent } from '../schema';

export const createAgentEvent = async (input: CreateAgentEventInput): Promise<AgentEvent> => {
  try {
    // Insert agent event record
    const result = await db.insert(agentEventsTable)
      .values({
        workspace_id: input.workspace_id,
        agent: input.agent,
        action: input.action,
        input: input.input || null,
        output: input.output || null,
        status: input.status
      })
      .returning()
      .execute();

    const agentEvent = result[0];
    
    // Return the agent event with proper typing
    return {
      id: agentEvent.id,
      workspace_id: agentEvent.workspace_id,
      agent: agentEvent.agent,
      action: agentEvent.action,
      input: agentEvent.input as Record<string, any> | null,
      output: agentEvent.output as Record<string, any> | null,
      status: agentEvent.status,
      created_at: agentEvent.created_at
    };
  } catch (error) {
    console.error('Agent event creation failed:', error);
    throw error;
  }
};