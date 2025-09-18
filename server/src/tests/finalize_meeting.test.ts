import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, notesTable } from '../db/schema';
import { type FinalizeMeetingInput } from '../schema';
import { finalizeMeeting } from '../handlers/finalize_meeting';
import { eq } from 'drizzle-orm';

// Test data setup
const createTestUser = async () => {
  const result = await db.insert(usersTable)
    .values({
      email: 'test@example.com',
      display_name: 'Test User',
      timezone: 'America/New_York',
      llm_provider: 'openai',
      llm_model: 'gpt-4'
    })
    .returning()
    .execute();
  return result[0];
};

const createTestWorkspace = async (owner_id: string) => {
  const result = await db.insert(workspacesTable)
    .values({
      owner_id,
      name: 'Test Workspace',
      settings: { theme: 'dark' }
    })
    .returning()
    .execute();
  return result[0];
};

const createTestNote = async (workspace_id: string, created_by: string, transcript_text?: string) => {
  const result = await db.insert(notesTable)
    .values({
      workspace_id,
      title: 'Team Meeting',
      source: 'meeting' as const,
      transcript_text: transcript_text || 'Default meeting transcript for testing purposes.',
      created_by
    })
    .returning()
    .execute();
  return result[0];
};

describe('finalizeMeeting', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should finalize a meeting note with summary and entities', async () => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const note = await createTestNote(workspace.id, user.id, 'We decided to proceed with the project. John Smith will follow up on the budget concerns by March 15, 2024.');

    const input: FinalizeMeetingInput = {
      note_id: note.id
    };

    const result = await finalizeMeeting(input);

    // Verify return structure
    expect(result).toHaveProperty('summary_text');
    expect(result).toHaveProperty('entities');
    expect(typeof result.summary_text).toBe('string');
    expect(typeof result.entities).toBe('object');
    expect(result.summary_text.length).toBeGreaterThan(0);

    // Verify entities structure
    expect(result.entities).toHaveProperty('decisions');
    expect(result.entities).toHaveProperty('risks');
    expect(result.entities).toHaveProperty('people');
    expect(result.entities).toHaveProperty('dates');
    expect(result.entities).toHaveProperty('action_items');
    expect(result.entities).toHaveProperty('topics');
    
    // Verify arrays in entities
    expect(Array.isArray(result.entities['decisions'])).toBe(true);
    expect(Array.isArray(result.entities['risks'])).toBe(true);
    expect(Array.isArray(result.entities['people'])).toBe(true);
    expect(Array.isArray(result.entities['dates'])).toBe(true);
    expect(Array.isArray(result.entities['action_items'])).toBe(true);
    expect(Array.isArray(result.entities['topics'])).toBe(true);
  });

  it('should update the note in database with generated content', async () => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const note = await createTestNote(workspace.id, user.id, 'Meeting about project planning and budget allocation.');

    const input: FinalizeMeetingInput = {
      note_id: note.id
    };

    const result = await finalizeMeeting(input);

    // Verify database was updated
    const updatedNotes = await db.select()
      .from(notesTable)
      .where(eq(notesTable.id, note.id))
      .execute();

    expect(updatedNotes).toHaveLength(1);
    const updatedNote = updatedNotes[0];
    
    expect(updatedNote.summary_text).toBe(result.summary_text);
    expect(updatedNote.entities).toEqual(result.entities);
    expect(updatedNote.updated_at).toBeInstanceOf(Date);
    expect(updatedNote.updated_at.getTime()).toBeGreaterThan(note.updated_at.getTime());
  });

  it('should extract entities from transcript content', async () => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const richTranscript = 'We decided to move forward with the project. John Smith raised concerns about the budget risk. Sarah Johnson will follow up by December 25, 2024. The action items include reviewing the timeline and addressing security issues.';
    const note = await createTestNote(workspace.id, user.id, richTranscript);

    const input: FinalizeMeetingInput = {
      note_id: note.id
    };

    const result = await finalizeMeeting(input);

    // Verify specific entity extraction
    expect(result.entities['decisions'].length).toBeGreaterThan(0);
    expect(result.entities['people'].length).toBeGreaterThan(0);
    expect(result.entities['dates'].length).toBeGreaterThan(0);
    expect(result.entities['action_items'].length).toBeGreaterThan(0);
    expect(result.entities['topics'].length).toBeGreaterThan(0);

    // Verify specific extractions
    expect(result.entities['people']).toContain('John Smith');
    expect(result.entities['people']).toContain('Sarah Johnson');
    expect(result.entities['dates']).toContain('December 25, 2024');
  });

  it('should generate appropriate summary based on transcript length', async () => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    
    // Test short transcript
    const shortNote = await createTestNote(workspace.id, user.id, 'Brief meeting discussion.');
    const shortResult = await finalizeMeeting({ note_id: shortNote.id });
    expect(shortResult.summary_text).toMatch(/Brief meeting discussion/);

    // Test longer transcript
    const longTranscript = 'This is a comprehensive meeting discussion that covers multiple topics and involves detailed analysis of project requirements, budget considerations, timeline planning, resource allocation, risk assessment, stakeholder engagement, and strategic decision making processes that require extensive documentation and follow-up actions.'.repeat(10);
    const longNote = await createTestNote(workspace.id, user.id, longTranscript);
    const longResult = await finalizeMeeting({ note_id: longNote.id });
    expect(longResult.summary_text).toMatch(/Comprehensive meeting discussion/);
  });

  it('should throw error when note not found', async () => {
    const input: FinalizeMeetingInput = {
      note_id: '12345678-1234-1234-1234-123456789abc'
    };

    await expect(finalizeMeeting(input)).rejects.toThrow(/Meeting note not found/i);
  });

  it('should throw error when note has no transcript text', async () => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    
    // Create note without transcript text
    const result = await db.insert(notesTable)
      .values({
        workspace_id: workspace.id,
        title: 'Meeting without transcript',
        source: 'meeting' as const,
        transcript_text: null,
        created_by: user.id
      })
      .returning()
      .execute();
    const note = result[0];

    const input: FinalizeMeetingInput = {
      note_id: note.id
    };

    await expect(finalizeMeeting(input)).rejects.toThrow(/No transcript text found/i);
  });

  it('should handle empty transcript text gracefully', async () => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const note = await createTestNote(workspace.id, user.id, '');

    const input: FinalizeMeetingInput = {
      note_id: note.id
    };

    const result = await finalizeMeeting(input);

    expect(result.summary_text).toBeDefined();
    expect(result.entities).toBeDefined();
    expect(typeof result.summary_text).toBe('string');
  });

  it('should include meeting title in topics entities', async () => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const note = await createTestNote(workspace.id, user.id, 'Standard meeting discussion content.');

    const input: FinalizeMeetingInput = {
      note_id: note.id
    };

    const result = await finalizeMeeting(input);

    expect(result.entities['topics']).toContain('Team Meeting');
  });

  it('should deduplicate extracted people names', async () => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    const transcript = 'John Smith spoke first. Then John Smith raised concerns. Sarah Johnson agreed with John Smith.';
    const note = await createTestNote(workspace.id, user.id, transcript);

    const input: FinalizeMeetingInput = {
      note_id: note.id
    };

    const result = await finalizeMeeting(input);

    // Count occurrences of John Smith in people array
    const johnSmithCount = result.entities['people'].filter((name: string) => name === 'John Smith').length;
    expect(johnSmithCount).toBe(1); // Should be deduplicated
  });
});