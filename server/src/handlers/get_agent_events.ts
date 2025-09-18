import { db } from '../db';
import { agentEventsTable } from '../db/schema';
import { type AgentEvent, type AgentEventStatus } from '../schema';
import { eq, and, desc, type SQL } from 'drizzle-orm';

export const getAgentEvents = async (workspaceId: string, status?: AgentEventStatus): Promise<AgentEvent[]> => {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [];
    
    // Always filter by workspace_id
    conditions.push(eq(agentEventsTable.workspace_id, workspaceId));
    
    // Conditionally filter by status
    if (status !== undefined) {
      conditions.push(eq(agentEventsTable.status, status));
    }

    // Build final query with all conditions at once
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    
    const results = await db.select()
      .from(agentEventsTable)
      .where(whereClause)
      .orderBy(desc(agentEventsTable.created_at))
      .execute();

    // Convert JSON fields to proper types
    return results.map(result => ({
      ...result,
      input: result.input as Record<string, any> | null,
      output: result.output as Record<string, any> | null
    }));
  } catch (error) {
    console.error('Get agent events failed:', error);
    throw error;
  }
};