import { db } from '../db';
import { notesTable } from '../db/schema';
import { type Note } from '../schema';
import { eq, desc } from 'drizzle-orm';

export const getNotes = async (workspaceId: string): Promise<Note[]> => {
  try {
    const results = await db.select()
      .from(notesTable)
      .where(eq(notesTable.workspace_id, workspaceId))
      .orderBy(desc(notesTable.created_at))
      .execute();

    // Convert database results to schema-compliant Note objects
    return results.map(note => ({
      id: note.id,
      workspace_id: note.workspace_id,
      title: note.title,
      source: note.source,
      content_md: note.content_md,
      transcript_text: note.transcript_text,
      summary_text: note.summary_text,
      entities: note.entities as Record<string, any> | null,
      created_by: note.created_by,
      created_at: note.created_at,
      updated_at: note.updated_at
    }));
  } catch (error) {
    console.error('Failed to fetch notes:', error);
    throw error;
  }
};