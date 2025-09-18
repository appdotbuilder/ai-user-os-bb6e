import { db } from '../db';
import { workspacesTable } from '../db/schema';
import { type Workspace } from '../schema';
import { eq } from 'drizzle-orm';

export const getUserWorkspaces = async (userId: string): Promise<Workspace[]> => {
  try {
    // Query all workspaces owned by the user
    const results = await db.select()
      .from(workspacesTable)
      .where(eq(workspacesTable.owner_id, userId))
      .execute();

    // Map results to ensure proper typing for JSON fields
    return results.map(workspace => ({
      ...workspace,
      settings: workspace.settings as Record<string, any> | null
    }));
  } catch (error) {
    console.error('Failed to fetch user workspaces:', error);
    throw error;
  }
};