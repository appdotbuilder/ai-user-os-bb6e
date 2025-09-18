import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable, notesTable } from '../db/schema';
import { type TranscribeMeetingInput } from '../schema';
import { transcribeMeeting } from '../handlers/transcribe_meeting';
import { eq } from 'drizzle-orm';

describe('transcribeMeeting', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    let testUser: any;
    let testWorkspace: any;
    let testNote: any;

    beforeEach(async () => {
        // Create test user
        const users = await db.insert(usersTable)
            .values({
                email: 'test@example.com',
                display_name: 'Test User',
                timezone: 'UTC',
                llm_provider: 'openai',
                llm_model: 'gpt-4'
            })
            .returning()
            .execute();
        testUser = users[0];

        // Create test workspace
        const workspaces = await db.insert(workspacesTable)
            .values({
                owner_id: testUser.id,
                name: 'Test Workspace'
            })
            .returning()
            .execute();
        testWorkspace = workspaces[0];

        // Create test note
        const notes = await db.insert(notesTable)
            .values({
                workspace_id: testWorkspace.id,
                title: 'Meeting Notes',
                source: 'meeting',
                created_by: testUser.id
            })
            .returning()
            .execute();
        testNote = notes[0];
    });

    it('should transcribe audio chunk without existing note', async () => {
        const input: TranscribeMeetingInput = {
            audio_chunk: 'YWJjZGVmZw==', // Short base64 chunk
        };

        const result = await transcribeMeeting(input);

        expect(result.partial_transcript).toBe('Hello');
        expect(result.note_id).toBeUndefined();
    });

    it('should transcribe medium audio chunk', async () => {
        const input: TranscribeMeetingInput = {
            audio_chunk: 'a'.repeat(200), // Medium chunk
        };

        const result = await transcribeMeeting(input);

        expect(result.partial_transcript).toBe('Hello everyone, welcome to today\'s meeting.');
        expect(result.note_id).toBeUndefined();
    });

    it('should transcribe large audio chunk', async () => {
        const input: TranscribeMeetingInput = {
            audio_chunk: 'a'.repeat(1500), // Large chunk
        };

        const result = await transcribeMeeting(input);

        expect(result.partial_transcript).toBe('The project is progressing well, but we need to address some technical challenges that have emerged this week.');
        expect(result.note_id).toBeUndefined();
    });

    it('should update existing note with transcript', async () => {
        const input: TranscribeMeetingInput = {
            audio_chunk: 'YWJjZGVmZw==',
            note_id: testNote.id
        };

        const result = await transcribeMeeting(input);

        expect(result.partial_transcript).toBe('Hello');
        expect(result.note_id).toBe(testNote.id);

        // Verify note was updated in database
        const updatedNotes = await db.select()
            .from(notesTable)
            .where(eq(notesTable.id, testNote.id))
            .execute();

        expect(updatedNotes).toHaveLength(1);
        expect(updatedNotes[0].transcript_text).toBe('Hello');
        expect(updatedNotes[0].updated_at).toBeInstanceOf(Date);
    });

    it('should append to existing transcript text', async () => {
        // First, set some initial transcript text
        await db.update(notesTable)
            .set({ transcript_text: 'Initial transcript.' })
            .where(eq(notesTable.id, testNote.id))
            .execute();

        const input: TranscribeMeetingInput = {
            audio_chunk: 'a'.repeat(200),
            note_id: testNote.id
        };

        const result = await transcribeMeeting(input);

        expect(result.partial_transcript).toBe('Hello everyone, welcome to today\'s meeting.');
        expect(result.note_id).toBe(testNote.id);

        // Verify transcript was appended
        const updatedNotes = await db.select()
            .from(notesTable)
            .where(eq(notesTable.id, testNote.id))
            .execute();

        expect(updatedNotes[0].transcript_text).toBe('Initial transcript. Hello everyone, welcome to today\'s meeting.');
    });

    it('should handle empty transcript text when appending', async () => {
        // Note has null transcript_text initially
        const input: TranscribeMeetingInput = {
            audio_chunk: 'dGVzdA==',
            note_id: testNote.id
        };

        const result = await transcribeMeeting(input);

        expect(result.partial_transcript).toBe('Hello');

        // Verify transcript was set correctly (not prefixed with null/undefined)
        const updatedNotes = await db.select()
            .from(notesTable)
            .where(eq(notesTable.id, testNote.id))
            .execute();

        expect(updatedNotes[0].transcript_text).toBe('Hello');
    });

    it('should throw error for invalid audio chunk', async () => {
        const input: TranscribeMeetingInput = {
            audio_chunk: '', // Empty chunk
        };

        await expect(transcribeMeeting(input)).rejects.toThrow(/Invalid audio chunk/);
    });

    it('should throw error for non-string audio chunk', async () => {
        const input = {
            audio_chunk: null, // Invalid type
        } as any;

        await expect(transcribeMeeting(input)).rejects.toThrow(/Invalid audio chunk/);
    });

    it('should throw error for non-existent note_id', async () => {
        const input: TranscribeMeetingInput = {
            audio_chunk: 'dGVzdA==',
            note_id: '550e8400-e29b-41d4-a716-446655440000' // Non-existent UUID
        };

        await expect(transcribeMeeting(input)).rejects.toThrow(/Note with id .+ not found/);
    });

    it('should process multiple transcript chunks sequentially', async () => {
        // First chunk
        const input1: TranscribeMeetingInput = {
            audio_chunk: 'a'.repeat(200),
            note_id: testNote.id
        };

        await transcribeMeeting(input1);

        // Second chunk
        const input2: TranscribeMeetingInput = {
            audio_chunk: 'b'.repeat(800),
            note_id: testNote.id
        };

        const result2 = await transcribeMeeting(input2);

        expect(result2.partial_transcript).toBe('We need to discuss the quarterly results and plan for next month.');

        // Verify both chunks are in the transcript
        const finalNotes = await db.select()
            .from(notesTable)
            .where(eq(notesTable.id, testNote.id))
            .execute();

        const expectedTranscript = 'Hello everyone, welcome to today\'s meeting. We need to discuss the quarterly results and plan for next month.';
        expect(finalNotes[0].transcript_text).toBe(expectedTranscript);
    });
});