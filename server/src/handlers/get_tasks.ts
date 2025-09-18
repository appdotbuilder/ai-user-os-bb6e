import { db } from '../db';
import { tasksTable } from '../db/schema';
import { type Task, type TaskStatus } from '../schema';
import { eq, and, SQL } from 'drizzle-orm';

export const getTasks = async (workspaceId: string, status?: TaskStatus): Promise<Task[]> => {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [];
    conditions.push(eq(tasksTable.workspace_id, workspaceId));

    if (status) {
      conditions.push(eq(tasksTable.status, status));
    }

    // Build and execute query
    const results = await db.select()
      .from(tasksTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .execute();

    // Return results - no numeric conversions needed for tasks table
    return results;
  } catch (error) {
    console.error('Get tasks failed:', error);
    throw error;
  }
};