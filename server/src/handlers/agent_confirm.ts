import { db } from '../db';
import { agentEventsTable, tasksTable, notesTable } from '../db/schema';
import { type AgentConfirmInput, type AgentEvent } from '../schema';
import { eq } from 'drizzle-orm';

export const agentConfirm = async (input: AgentConfirmInput): Promise<AgentEvent> => {
  try {
    // First, fetch the agent event to confirm it exists and is in the right state
    const agentEvents = await db.select()
      .from(agentEventsTable)
      .where(eq(agentEventsTable.id, input.agent_event_id))
      .execute();

    if (agentEvents.length === 0) {
      throw new Error(`Agent event not found: ${input.agent_event_id}`);
    }

    const agentEvent = agentEvents[0];

    // Validate that the event is in awaiting_confirmation status
    if (agentEvent.status !== 'awaiting_confirmation') {
      throw new Error(`Agent event ${input.agent_event_id} is not awaiting confirmation. Current status: ${agentEvent.status}`);
    }

    // Execute the action based on agent type and action
    let actionOutput: Record<string, any> = {};

    if (agentEvent.agent === 'TaskAgent' && agentEvent.action === 'create_task') {
      // Execute task creation
      if (!agentEvent.input) {
        throw new Error('No input data found for task creation');
      }

      const taskInput = agentEvent.input as any;
      const taskResult = await db.insert(tasksTable)
        .values({
          workspace_id: taskInput.workspace_id,
          title: taskInput.title,
          description: taskInput.description || null,
          priority: taskInput.priority || 'med',
          due_at: taskInput.due_at ? new Date(taskInput.due_at) : null,
          assignee_id: taskInput.assignee_id,
          linked_note_id: taskInput.linked_note_id || null
        })
        .returning()
        .execute();

      actionOutput = {
        task_id: taskResult[0].id,
        message: 'Task created successfully'
      };
    } else if (agentEvent.agent === 'NoteAgent' && agentEvent.action === 'update_note') {
      // Execute note update
      if (!agentEvent.input) {
        throw new Error('No input data found for note update');
      }

      const noteInput = agentEvent.input as any;
      const updateData: any = {};
      
      if (noteInput.summary_text !== undefined) {
        updateData.summary_text = noteInput.summary_text;
      }
      if (noteInput.entities !== undefined) {
        updateData.entities = noteInput.entities;
      }
      if (noteInput.content_md !== undefined) {
        updateData.content_md = noteInput.content_md;
      }

      // Add updated_at timestamp
      updateData.updated_at = new Date();

      const noteResult = await db.update(notesTable)
        .set(updateData)
        .where(eq(notesTable.id, noteInput.note_id))
        .returning()
        .execute();

      if (noteResult.length === 0) {
        throw new Error(`Note not found: ${noteInput.note_id}`);
      }

      actionOutput = {
        note_id: noteResult[0].id,
        message: 'Note updated successfully'
      };
    } else {
      throw new Error(`Unsupported agent action: ${agentEvent.agent}/${agentEvent.action}`);
    }

    // Update the agent event status to 'executed' with the action output
    const updatedEvent = await db.update(agentEventsTable)
      .set({
        status: 'executed',
        output: actionOutput
      })
      .where(eq(agentEventsTable.id, input.agent_event_id))
      .returning()
      .execute();

    const returnEvent = updatedEvent[0];
    return {
      id: returnEvent.id,
      workspace_id: returnEvent.workspace_id,
      agent: returnEvent.agent,
      action: returnEvent.action,
      input: returnEvent.input as Record<string, any> | null,
      output: returnEvent.output as Record<string, any> | null,
      status: returnEvent.status,
      created_at: returnEvent.created_at
    };
  } catch (error) {
    // If execution fails, update status to 'error'
    try {
      await db.update(agentEventsTable)
        .set({
          status: 'error',
          output: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
        .where(eq(agentEventsTable.id, input.agent_event_id))
        .execute();
    } catch (updateError) {
      console.error('Failed to update agent event status to error:', updateError);
    }

    console.error('Agent confirmation failed:', error);
    throw error;
  }
};