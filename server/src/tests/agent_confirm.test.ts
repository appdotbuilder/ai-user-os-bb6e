import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, notesTable, tasksTable, agentEventsTable } from '../db/schema';
import { type AgentConfirmInput } from '../schema';
import { agentConfirm } from '../handlers/agent_confirm';
import { eq } from 'drizzle-orm';

// Test data setup
const createTestUser = async () => {
  const result = await db.insert(usersTable)
    .values({
      email: 'test@example.com',
      display_name: 'Test User',
      timezone: 'Australia/Adelaide',
      llm_provider: 'openai',
      llm_model: 'gpt-4.1'
    })
    .returning()
    .execute();
  return result[0];
};

const createTestWorkspace = async (ownerId: string) => {
  const result = await db.insert(workspacesTable)
    .values({
      owner_id: ownerId,
      name: 'Test Workspace',
      settings: null
    })
    .returning()
    .execute();
  return result[0];
};

const createTestNote = async (workspaceId: string, createdBy: string) => {
  const result = await db.insert(notesTable)
    .values({
      workspace_id: workspaceId,
      title: 'Test Note',
      source: 'manual',
      content_md: 'Original content',
      created_by: createdBy
    })
    .returning()
    .execute();
  return result[0];
};

describe('agentConfirm', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should confirm and execute TaskAgent create_task action', async () => {
    // Setup test data
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);

    const taskInput = {
      workspace_id: workspace.id,
      title: 'Test Task',
      description: 'Task description',
      priority: 'high',
      assignee_id: user.id
    };

    // Create agent event awaiting confirmation
    const agentEventResult = await db.insert(agentEventsTable)
      .values({
        workspace_id: workspace.id,
        agent: 'TaskAgent',
        action: 'create_task',
        input: taskInput,
        status: 'awaiting_confirmation'
      })
      .returning()
      .execute();

    const agentEventId = agentEventResult[0].id;

    const input: AgentConfirmInput = {
      agent_event_id: agentEventId
    };

    // Execute confirmation
    const result = await agentConfirm(input);

    // Verify the agent event was updated
    expect(result.id).toBe(agentEventId);
    expect(result.status).toBe('executed');
    expect(result.output).toEqual({
      task_id: expect.any(String),
      message: 'Task created successfully'
    });

    // Verify task was actually created
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.id, result.output!['task_id']))
      .execute();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Test Task');
    expect(tasks[0].description).toBe('Task description');
    expect(tasks[0].priority).toBe('high');
    expect(tasks[0].assignee_id).toBe(user.id);
    expect(tasks[0].workspace_id).toBe(workspace.id);
  });

  it('should confirm and execute NoteAgent update_note action', async () => {
    // Setup test data
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const note = await createTestNote(workspace.id, user.id);

    const noteUpdateInput = {
      note_id: note.id,
      summary_text: 'Updated summary',
      entities: { people: ['John Doe'], topics: ['meeting'] }
    };

    // Create agent event awaiting confirmation
    const agentEventResult = await db.insert(agentEventsTable)
      .values({
        workspace_id: workspace.id,
        agent: 'NoteAgent',
        action: 'update_note',
        input: noteUpdateInput,
        status: 'awaiting_confirmation'
      })
      .returning()
      .execute();

    const agentEventId = agentEventResult[0].id;

    const input: AgentConfirmInput = {
      agent_event_id: agentEventId
    };

    // Execute confirmation
    const result = await agentConfirm(input);

    // Verify the agent event was updated
    expect(result.id).toBe(agentEventId);
    expect(result.status).toBe('executed');
    expect(result.output).toEqual({
      note_id: note.id,
      message: 'Note updated successfully'
    });

    // Verify note was actually updated
    const notes = await db.select()
      .from(notesTable)
      .where(eq(notesTable.id, note.id))
      .execute();

    expect(notes).toHaveLength(1);
    expect(notes[0].summary_text).toBe('Updated summary');
    expect(notes[0].entities).toEqual({ people: ['John Doe'], topics: ['meeting'] });
    expect(notes[0].updated_at).toBeInstanceOf(Date);
    expect(notes[0].updated_at.getTime()).toBeGreaterThan(notes[0].created_at.getTime());
  });

  it('should throw error for non-existent agent event', async () => {
    const input: AgentConfirmInput = {
      agent_event_id: '00000000-0000-0000-0000-000000000000'
    };

    await expect(agentConfirm(input)).rejects.toThrow(/Agent event not found/i);
  });

  it('should throw error for agent event not awaiting confirmation', async () => {
    // Setup test data
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);

    // Create agent event with 'executed' status
    const agentEventResult = await db.insert(agentEventsTable)
      .values({
        workspace_id: workspace.id,
        agent: 'TaskAgent',
        action: 'create_task',
        input: { title: 'Test' },
        status: 'executed'
      })
      .returning()
      .execute();

    const input: AgentConfirmInput = {
      agent_event_id: agentEventResult[0].id
    };

    await expect(agentConfirm(input)).rejects.toThrow(/not awaiting confirmation/i);
  });

  it('should throw error for unsupported agent action', async () => {
    // Setup test data
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);

    // Create agent event with unsupported action
    const agentEventResult = await db.insert(agentEventsTable)
      .values({
        workspace_id: workspace.id,
        agent: 'UnknownAgent',
        action: 'unknown_action',
        input: {},
        status: 'awaiting_confirmation'
      })
      .returning()
      .execute();

    const input: AgentConfirmInput = {
      agent_event_id: agentEventResult[0].id
    };

    await expect(agentConfirm(input)).rejects.toThrow(/Unsupported agent action/i);
  });

  it('should handle task creation with minimal input', async () => {
    // Setup test data
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);

    const minimalTaskInput = {
      workspace_id: workspace.id,
      title: 'Minimal Task',
      assignee_id: user.id
    };

    // Create agent event awaiting confirmation
    const agentEventResult = await db.insert(agentEventsTable)
      .values({
        workspace_id: workspace.id,
        agent: 'TaskAgent',
        action: 'create_task',
        input: minimalTaskInput,
        status: 'awaiting_confirmation'
      })
      .returning()
      .execute();

    const input: AgentConfirmInput = {
      agent_event_id: agentEventResult[0].id
    };

    // Execute confirmation
    const result = await agentConfirm(input);

    // Verify task was created with defaults
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.id, result.output!['task_id']))
      .execute();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Minimal Task');
    expect(tasks[0].description).toBeNull();
    expect(tasks[0].priority).toBe('med'); // Default priority
    expect(tasks[0].status).toBe('todo'); // Default status
    expect(tasks[0].due_at).toBeNull();
  });

  it('should update agent event to error status when execution fails', async () => {
    // Setup test data
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);

    // Create agent event with invalid input (missing required field)
    const agentEventResult = await db.insert(agentEventsTable)
      .values({
        workspace_id: workspace.id,
        agent: 'TaskAgent',
        action: 'create_task',
        input: { title: 'Test Task' }, // Missing workspace_id and assignee_id
        status: 'awaiting_confirmation'
      })
      .returning()
      .execute();

    const input: AgentConfirmInput = {
      agent_event_id: agentEventResult[0].id
    };

    // Execute confirmation (should fail)
    await expect(agentConfirm(input)).rejects.toThrow();

    // Verify agent event was updated to error status
    const agentEvents = await db.select()
      .from(agentEventsTable)
      .where(eq(agentEventsTable.id, agentEventResult[0].id))
      .execute();

    expect(agentEvents).toHaveLength(1);
    expect(agentEvents[0].status).toBe('error');
    expect(agentEvents[0].output).toEqual({
      error: expect.any(String)
    });
  });

  it('should handle note update with partial fields', async () => {
    // Setup test data
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const note = await createTestNote(workspace.id, user.id);

    const partialUpdateInput = {
      note_id: note.id,
      summary_text: 'Only summary updated'
    };

    // Create agent event awaiting confirmation
    const agentEventResult = await db.insert(agentEventsTable)
      .values({
        workspace_id: workspace.id,
        agent: 'NoteAgent',
        action: 'update_note',
        input: partialUpdateInput,
        status: 'awaiting_confirmation'
      })
      .returning()
      .execute();

    const input: AgentConfirmInput = {
      agent_event_id: agentEventResult[0].id
    };

    // Execute confirmation
    const result = await agentConfirm(input);

    // Verify note was partially updated
    const notes = await db.select()
      .from(notesTable)
      .where(eq(notesTable.id, note.id))
      .execute();

    expect(notes).toHaveLength(1);
    expect(notes[0].summary_text).toBe('Only summary updated');
    expect(notes[0].content_md).toBe('Original content'); // Should remain unchanged
    expect(notes[0].entities).toBeNull(); // Should remain unchanged
  });
});