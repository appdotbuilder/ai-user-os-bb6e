import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, notesTable } from '../db/schema';
import { type CreateUserInput, type CreateWorkspaceInput, type CreateNoteInput } from '../schema';
import { getNotes } from '../handlers/get_notes';

// Test data
const testUser: CreateUserInput = {
  email: 'test@example.com',
  display_name: 'Test User',
  timezone: 'Australia/Adelaide',
  llm_provider: 'openai',
  llm_model: 'gpt-4.1'
};

const testWorkspace: CreateWorkspaceInput = {
  owner_id: '', // Will be set after user creation
  name: 'Test Workspace',
  settings: null
};

const testNote1: CreateNoteInput = {
  workspace_id: '', // Will be set after workspace creation
  title: 'First Note',
  source: 'manual',
  content_md: '# First Note Content',
  transcript_text: null,
  created_by: '' // Will be set after user creation
};

const testNote2: CreateNoteInput = {
  workspace_id: '', // Will be set after workspace creation
  title: 'Second Note',
  source: 'meeting',
  content_md: null,
  transcript_text: 'Meeting transcript text',
  created_by: '' // Will be set after user creation
};

describe('getNotes', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no notes exist', async () => {
    // Create user and workspace without notes
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const user = userResult[0];
    
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        ...testWorkspace,
        owner_id: user.id
      })
      .returning()
      .execute();
    
    const workspace = workspaceResult[0];

    const result = await getNotes(workspace.id);

    expect(result).toEqual([]);
  });

  it('should return all notes for a workspace ordered by creation date desc', async () => {
    // Create user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const user = userResult[0];
    
    // Create workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        ...testWorkspace,
        owner_id: user.id
      })
      .returning()
      .execute();
    
    const workspace = workspaceResult[0];

    // Create first note
    const note1Result = await db.insert(notesTable)
      .values({
        ...testNote1,
        workspace_id: workspace.id,
        created_by: user.id
      })
      .returning()
      .execute();
    
    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Create second note
    const note2Result = await db.insert(notesTable)
      .values({
        ...testNote2,
        workspace_id: workspace.id,
        created_by: user.id
      })
      .returning()
      .execute();

    const result = await getNotes(workspace.id);

    expect(result).toHaveLength(2);
    
    // Should be ordered by creation date descending (newest first)
    expect(result[0].title).toEqual('Second Note');
    expect(result[1].title).toEqual('First Note');
    
    // Verify first note details
    expect(result[0].id).toEqual(note2Result[0].id);
    expect(result[0].workspace_id).toEqual(workspace.id);
    expect(result[0].source).toEqual('meeting');
    expect(result[0].content_md).toBeNull();
    expect(result[0].transcript_text).toEqual('Meeting transcript text');
    expect(result[0].created_by).toEqual(user.id);
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].updated_at).toBeInstanceOf(Date);
    
    // Verify second note details
    expect(result[1].id).toEqual(note1Result[0].id);
    expect(result[1].workspace_id).toEqual(workspace.id);
    expect(result[1].source).toEqual('manual');
    expect(result[1].content_md).toEqual('# First Note Content');
    expect(result[1].transcript_text).toBeNull();
    expect(result[1].created_by).toEqual(user.id);
    expect(result[1].created_at).toBeInstanceOf(Date);
    expect(result[1].updated_at).toBeInstanceOf(Date);
  });

  it('should only return notes for the specified workspace', async () => {
    // Create user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const user = userResult[0];
    
    // Create two workspaces
    const workspace1Result = await db.insert(workspacesTable)
      .values({
        ...testWorkspace,
        name: 'Workspace 1',
        owner_id: user.id
      })
      .returning()
      .execute();
    
    const workspace2Result = await db.insert(workspacesTable)
      .values({
        ...testWorkspace,
        name: 'Workspace 2',
        owner_id: user.id
      })
      .returning()
      .execute();
    
    const workspace1 = workspace1Result[0];
    const workspace2 = workspace2Result[0];

    // Create note in workspace 1
    await db.insert(notesTable)
      .values({
        ...testNote1,
        workspace_id: workspace1.id,
        created_by: user.id
      })
      .execute();
    
    // Create note in workspace 2
    await db.insert(notesTable)
      .values({
        ...testNote2,
        workspace_id: workspace2.id,
        created_by: user.id
      })
      .execute();

    // Get notes for workspace 1 only
    const result = await getNotes(workspace1.id);

    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('First Note');
    expect(result[0].workspace_id).toEqual(workspace1.id);
  });

  it('should handle notes with all fields populated', async () => {
    // Create user and workspace
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    const user = userResult[0];
    
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        ...testWorkspace,
        owner_id: user.id
      })
      .returning()
      .execute();
    
    const workspace = workspaceResult[0];

    // Create note with all fields populated
    const fullNote = {
      workspace_id: workspace.id,
      title: 'Full Note',
      source: 'import' as const,
      content_md: '# Full content',
      transcript_text: 'Full transcript',
      summary_text: 'Full summary',
      entities: { people: ['John', 'Jane'], topics: ['meeting', 'project'] },
      created_by: user.id
    };

    const noteResult = await db.insert(notesTable)
      .values(fullNote)
      .returning()
      .execute();

    const result = await getNotes(workspace.id);

    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('Full Note');
    expect(result[0].source).toEqual('import');
    expect(result[0].content_md).toEqual('# Full content');
    expect(result[0].transcript_text).toEqual('Full transcript');
    expect(result[0].summary_text).toEqual('Full summary');
    expect(result[0].entities).toEqual({ people: ['John', 'Jane'], topics: ['meeting', 'project'] });
  });
});