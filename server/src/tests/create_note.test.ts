import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { notesTable, usersTable, workspacesTable } from '../db/schema';
import { type CreateNoteInput } from '../schema';
import { createNote } from '../handlers/create_note';
import { eq } from 'drizzle-orm';

describe('createNote', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: string;
  let testWorkspaceId: string;

  beforeEach(async () => {
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create prerequisite workspace
    const workspaceResult = await db.insert(workspacesTable)
      .values({
        owner_id: testUserId,
        name: 'Test Workspace'
      })
      .returning()
      .execute();
    testWorkspaceId = workspaceResult[0].id;
  });

  it('should create a manual note with content', async () => {
    const testInput: CreateNoteInput = {
      workspace_id: testWorkspaceId,
      title: 'Test Manual Note',
      source: 'manual',
      content_md: '# Test Content\n\nThis is a test note.',
      created_by: testUserId
    };

    const result = await createNote(testInput);

    // Basic field validation
    expect(result.workspace_id).toEqual(testWorkspaceId);
    expect(result.title).toEqual('Test Manual Note');
    expect(result.source).toEqual('manual');
    expect(result.content_md).toEqual('# Test Content\n\nThis is a test note.');
    expect(result.transcript_text).toBeNull();
    expect(result.summary_text).toBeNull();
    expect(result.entities).toBeNull();
    expect(result.created_by).toEqual(testUserId);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a meeting note with transcript', async () => {
    const testInput: CreateNoteInput = {
      workspace_id: testWorkspaceId,
      title: 'Daily Standup - March 15',
      source: 'meeting',
      transcript_text: 'John: Good morning everyone. Let\'s start with updates...',
      created_by: testUserId
    };

    const result = await createNote(testInput);

    expect(result.workspace_id).toEqual(testWorkspaceId);
    expect(result.title).toEqual('Daily Standup - March 15');
    expect(result.source).toEqual('meeting');
    expect(result.content_md).toBeNull();
    expect(result.transcript_text).toEqual('John: Good morning everyone. Let\'s start with updates...');
    expect(result.summary_text).toBeNull();
    expect(result.entities).toBeNull();
    expect(result.created_by).toEqual(testUserId);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create an import note with minimal data', async () => {
    const testInput: CreateNoteInput = {
      workspace_id: testWorkspaceId,
      title: 'Imported Note from External System',
      source: 'import',
      created_by: testUserId
    };

    const result = await createNote(testInput);

    expect(result.workspace_id).toEqual(testWorkspaceId);
    expect(result.title).toEqual('Imported Note from External System');
    expect(result.source).toEqual('import');
    expect(result.content_md).toBeNull();
    expect(result.transcript_text).toBeNull();
    expect(result.summary_text).toBeNull();
    expect(result.entities).toBeNull();
    expect(result.created_by).toEqual(testUserId);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a note with both content and transcript', async () => {
    const testInput: CreateNoteInput = {
      workspace_id: testWorkspaceId,
      title: 'Hybrid Meeting Note',
      source: 'meeting',
      content_md: '## Meeting Notes\n\n- Point 1\n- Point 2',
      transcript_text: 'Meeting transcript here...',
      created_by: testUserId
    };

    const result = await createNote(testInput);

    expect(result.workspace_id).toEqual(testWorkspaceId);
    expect(result.title).toEqual('Hybrid Meeting Note');
    expect(result.source).toEqual('meeting');
    expect(result.content_md).toEqual('## Meeting Notes\n\n- Point 1\n- Point 2');
    expect(result.transcript_text).toEqual('Meeting transcript here...');
    expect(result.summary_text).toBeNull();
    expect(result.entities).toBeNull();
    expect(result.created_by).toEqual(testUserId);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save note to database', async () => {
    const testInput: CreateNoteInput = {
      workspace_id: testWorkspaceId,
      title: 'Database Test Note',
      source: 'manual',
      content_md: 'Test content for database verification',
      created_by: testUserId
    };

    const result = await createNote(testInput);

    // Query the database to verify the note was saved
    const notes = await db.select()
      .from(notesTable)
      .where(eq(notesTable.id, result.id))
      .execute();

    expect(notes).toHaveLength(1);
    expect(notes[0].workspace_id).toEqual(testWorkspaceId);
    expect(notes[0].title).toEqual('Database Test Note');
    expect(notes[0].source).toEqual('manual');
    expect(notes[0].content_md).toEqual('Test content for database verification');
    expect(notes[0].transcript_text).toBeNull();
    expect(notes[0].created_by).toEqual(testUserId);
    expect(notes[0].created_at).toBeInstanceOf(Date);
    expect(notes[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle foreign key constraints for workspace_id', async () => {
    const testInput: CreateNoteInput = {
      workspace_id: '00000000-0000-0000-0000-000000000000', // Non-existent workspace
      title: 'Test Note',
      source: 'manual',
      created_by: testUserId
    };

    await expect(createNote(testInput)).rejects.toThrow(/violates foreign key constraint/i);
  });

  it('should handle foreign key constraints for created_by', async () => {
    const testInput: CreateNoteInput = {
      workspace_id: testWorkspaceId,
      title: 'Test Note',
      source: 'manual',
      created_by: '00000000-0000-0000-0000-000000000000' // Non-existent user
    };

    await expect(createNote(testInput)).rejects.toThrow(/violates foreign key constraint/i);
  });

  it('should handle all note sources correctly', async () => {
    const sources = ['manual', 'meeting', 'import'] as const;
    
    for (const source of sources) {
      const testInput: CreateNoteInput = {
        workspace_id: testWorkspaceId,
        title: `${source} Note`,
        source: source,
        created_by: testUserId
      };

      const result = await createNote(testInput);
      expect(result.source).toEqual(source);
      expect(result.title).toEqual(`${source} Note`);
    }
  });

  it('should set created_at and updated_at timestamps', async () => {
    const beforeCreate = new Date();
    
    const testInput: CreateNoteInput = {
      workspace_id: testWorkspaceId,
      title: 'Timestamp Test Note',
      source: 'manual',
      created_by: testUserId
    };

    const result = await createNote(testInput);
    const afterCreate = new Date();

    expect(result.created_at.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(result.created_at.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    expect(result.updated_at.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(result.updated_at.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
  });
});