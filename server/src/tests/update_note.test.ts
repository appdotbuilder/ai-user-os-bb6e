import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, notesTable } from '../db/schema';
import { type UpdateNoteInput, type CreateUserInput, type CreateWorkspaceInput, type CreateNoteInput } from '../schema';
import { updateNote } from '../handlers/update_note';
import { eq } from 'drizzle-orm';

// Test data
const testUser: CreateUserInput = {
  email: 'testuser@example.com',
  display_name: 'Test User',
  timezone: 'Australia/Adelaide',
  llm_provider: 'openai',
  llm_model: 'gpt-4.1'
};

const testWorkspace: CreateWorkspaceInput = {
  owner_id: '',  // Will be set after user creation
  name: 'Test Workspace',
  settings: { theme: 'dark' }
};

const testNote: CreateNoteInput = {
  workspace_id: '',  // Will be set after workspace creation
  title: 'Original Note',
  source: 'manual',
  content_md: '# Original content',
  transcript_text: 'Original transcript',
  created_by: ''  // Will be set after user creation
};

describe('updateNote', () => {
  let createdUserId: string;
  let createdWorkspaceId: string;
  let createdNoteId: string;

  beforeEach(async () => {
    await createDB();
    
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    createdUserId = userResult[0].id;

    // Create prerequisite workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        ...testWorkspace,
        owner_id: createdUserId
      })
      .returning()
      .execute();
    createdWorkspaceId = workspaceResult[0].id;

    // Create prerequisite note
    const noteResult = await db.insert(notesTable)
      .values({
        ...testNote,
        workspace_id: createdWorkspaceId,
        created_by: createdUserId
      })
      .returning()
      .execute();
    createdNoteId = noteResult[0].id;
  });

  afterEach(resetDB);

  it('should update note title only', async () => {
    const updateInput: UpdateNoteInput = {
      id: createdNoteId,
      title: 'Updated Note Title'
    };

    const result = await updateNote(updateInput);

    expect(result.id).toEqual(createdNoteId);
    expect(result.title).toEqual('Updated Note Title');
    expect(result.content_md).toEqual('# Original content'); // Should remain unchanged
    expect(result.transcript_text).toEqual('Original transcript'); // Should remain unchanged
    expect(result.summary_text).toBeNull();
    expect(result.entities).toBeNull();
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update multiple fields simultaneously', async () => {
    const updateInput: UpdateNoteInput = {
      id: createdNoteId,
      title: 'Comprehensive Update',
      content_md: '# Updated markdown content\n\nWith new details.',
      summary_text: 'This is a comprehensive summary of the updated note.',
      entities: { 
        people: ['John Doe', 'Jane Smith'],
        topics: ['project planning', 'team meeting']
      }
    };

    const result = await updateNote(updateInput);

    expect(result.id).toEqual(createdNoteId);
    expect(result.title).toEqual('Comprehensive Update');
    expect(result.content_md).toEqual('# Updated markdown content\n\nWith new details.');
    expect(result.transcript_text).toEqual('Original transcript'); // Should remain unchanged
    expect(result.summary_text).toEqual('This is a comprehensive summary of the updated note.');
    expect(result.entities).toEqual({
      people: ['John Doe', 'Jane Smith'],
      topics: ['project planning', 'team meeting']
    });
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should set fields to null when explicitly provided', async () => {
    const updateInput: UpdateNoteInput = {
      id: createdNoteId,
      content_md: null,
      transcript_text: null,
      summary_text: null,
      entities: null
    };

    const result = await updateNote(updateInput);

    expect(result.id).toEqual(createdNoteId);
    expect(result.title).toEqual('Original Note'); // Should remain unchanged
    expect(result.content_md).toBeNull();
    expect(result.transcript_text).toBeNull();
    expect(result.summary_text).toBeNull();
    expect(result.entities).toBeNull();
  });

  it('should update transcript_text for meeting transcripts', async () => {
    const updateInput: UpdateNoteInput = {
      id: createdNoteId,
      transcript_text: 'Updated meeting transcript with new content and better accuracy.',
      summary_text: 'Meeting covered project status and next steps.'
    };

    const result = await updateNote(updateInput);

    expect(result.id).toEqual(createdNoteId);
    expect(result.transcript_text).toEqual('Updated meeting transcript with new content and better accuracy.');
    expect(result.summary_text).toEqual('Meeting covered project status and next steps.');
    expect(result.content_md).toEqual('# Original content'); // Should remain unchanged
  });

  it('should save updated note to database', async () => {
    const updateInput: UpdateNoteInput = {
      id: createdNoteId,
      title: 'Database Verification Test',
      entities: { keywords: ['test', 'database', 'verification'] }
    };

    const result = await updateNote(updateInput);

    // Verify the update was persisted to database
    const dbNote = await db.select()
      .from(notesTable)
      .where(eq(notesTable.id, result.id))
      .execute();

    expect(dbNote).toHaveLength(1);
    expect(dbNote[0].title).toEqual('Database Verification Test');
    expect(dbNote[0].entities).toEqual({ keywords: ['test', 'database', 'verification'] });
    expect(dbNote[0].updated_at).toBeInstanceOf(Date);
    
    // Verify updated_at is more recent than created_at
    expect(dbNote[0].updated_at.getTime()).toBeGreaterThan(dbNote[0].created_at.getTime());
  });

  it('should throw error for non-existent note', async () => {
    const updateInput: UpdateNoteInput = {
      id: '00000000-0000-0000-0000-000000000000',
      title: 'This should fail'
    };

    await expect(updateNote(updateInput)).rejects.toThrow(/Note with id .+ not found/i);
  });

  it('should update entities with complex nested structure', async () => {
    const complexEntities = {
      people: [
        { name: 'Alice Johnson', role: 'Project Manager' },
        { name: 'Bob Wilson', role: 'Developer' }
      ],
      action_items: [
        { task: 'Review specifications', assignee: 'Alice', due: '2024-01-15' },
        { task: 'Implement feature', assignee: 'Bob', due: '2024-01-20' }
      ],
      decisions: [
        'Use PostgreSQL for database',
        'Deploy on AWS infrastructure'
      ]
    };

    const updateInput: UpdateNoteInput = {
      id: createdNoteId,
      entities: complexEntities
    };

    const result = await updateNote(updateInput);

    expect(result.entities).toEqual(complexEntities);
    
    // Verify complex structure is preserved in database
    const dbNote = await db.select()
      .from(notesTable)
      .where(eq(notesTable.id, result.id))
      .execute();
    
    expect(dbNote[0].entities).toEqual(complexEntities);
  });
});