import { db } from '../db';
import { tasksTable, usersTable, workspacesTable, notesTable } from '../db/schema';
import { type CreateTaskInput, type Task } from '../schema';
import { eq, and } from 'drizzle-orm';

export const createTask = async (input: CreateTaskInput): Promise<Task> => {
  try {
    // Verify workspace exists
    const workspaceExists = await db.select({ id: workspacesTable.id })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, input.workspace_id))
      .execute();

    if (workspaceExists.length === 0) {
      throw new Error(`Workspace with id ${input.workspace_id} not found`);
    }

    // Verify assignee exists
    const assigneeExists = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, input.assignee_id))
      .execute();

    if (assigneeExists.length === 0) {
      throw new Error(`User with id ${input.assignee_id} not found`);
    }

    // Verify linked note exists if provided
    if (input.linked_note_id) {
      const noteExists = await db.select({ id: notesTable.id })
        .from(notesTable)
        .where(and(
          eq(notesTable.id, input.linked_note_id),
          eq(notesTable.workspace_id, input.workspace_id)
        ))
        .execute();

      if (noteExists.length === 0) {
        throw new Error(`Note with id ${input.linked_note_id} not found in workspace ${input.workspace_id}`);
      }
    }

    // Insert task record
    const result = await db.insert(tasksTable)
      .values({
        workspace_id: input.workspace_id,
        title: input.title,
        description: input.description || null,
        priority: input.priority, // Has default 'med' applied by Zod
        due_at: input.due_at || null,
        assignee_id: input.assignee_id,
        linked_note_id: input.linked_note_id || null
        // status has database default 'todo'
        // created_at and updated_at have database defaults
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Task creation failed:', error);
    throw error;
  }
};