import { db } from '../db';
import { agentEventsTable } from '../db/schema';
import { type AgentProposeInput, type AgentEvent } from '../schema';

export const agentPropose = async (input: AgentProposeInput, workspaceId: string): Promise<AgentEvent> => {
  try {
    // Map agent types to their corresponding actions
    const agentActions: Record<string, string> = {
      'NoteTakingAgent': 'create_note',
      'TaskAgent': 'create_task',
      'SchedulerAgent': 'create_calendar_event',
      'KnowledgeAgent': 'extract_knowledge'
    };

    // Determine the action based on the agent type, fallback to generic 'propose_action'
    const action = agentActions[input.agent] || 'propose_action';

    // Insert agent event record with draft status
    const result = await db.insert(agentEventsTable)
      .values({
        workspace_id: workspaceId,
        agent: input.agent,
        action: action,
        input: input.input_json,
        output: null, // Will be populated when executed
        status: 'draft' // Default status for proposals awaiting user approval
      })
      .returning()
      .execute();

    const agentEvent = result[0];
    return {
      ...agentEvent,
      input: agentEvent.input as Record<string, any> | null,
      output: agentEvent.output as Record<string, any> | null
    };
  } catch (error) {
    console.error('Agent proposal creation failed:', error);
    throw error;
  }
};