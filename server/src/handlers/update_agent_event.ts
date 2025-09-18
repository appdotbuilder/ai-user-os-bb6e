import { db } from '../db';
import { agentEventsTable } from '../db/schema';
import { type UpdateAgentEventInput, type AgentEvent } from '../schema';
import { eq } from 'drizzle-orm';

export const updateAgentEvent = async (input: UpdateAgentEventInput): Promise<AgentEvent> => {
  try {
    // Build update values object with only provided fields
    const updateValues: Record<string, any> = {};
    
    if (input.output !== undefined) {
      updateValues['output'] = input.output;
    }
    
    if (input.status !== undefined) {
      updateValues['status'] = input.status;
    }

    // Update the agent event record
    const result = await db.update(agentEventsTable)
      .set(updateValues)
      .where(eq(agentEventsTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Agent event with id ${input.id} not found`);
    }

    // Return the result with proper type casting for json fields
    const agentEvent = result[0];
    return {
      ...agentEvent,
      input: agentEvent.input as Record<string, any> | null,
      output: agentEvent.output as Record<string, any> | null
    };
  } catch (error) {
    console.error('Agent event update failed:', error);
    throw error;
  }
};