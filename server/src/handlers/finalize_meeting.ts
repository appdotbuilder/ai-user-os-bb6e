import { db } from '../db';
import { notesTable } from '../db/schema';
import { type FinalizeMeetingInput } from '../schema';
import { eq } from 'drizzle-orm';

export interface MeetingSummary {
    summary_text: string;
    entities: Record<string, any>;
}

export const finalizeMeeting = async (input: FinalizeMeetingInput): Promise<MeetingSummary> => {
    try {
        // First, retrieve the meeting note to get transcript text
        const notes = await db.select()
            .from(notesTable)
            .where(eq(notesTable.id, input.note_id))
            .execute();

        if (notes.length === 0) {
            throw new Error('Meeting note not found');
        }

        const note = notes[0];

        if (!note.transcript_text || note.transcript_text.trim() === '') {
            throw new Error('No transcript text found for meeting note');
        }

        // Generate summary from transcript text
        // In a real implementation, this would use a NoteTakingAgent/LLM service
        const summary_text = generateSummary(note.transcript_text);
        
        // Extract entities from transcript text
        // In a real implementation, this would use NLP/AI to extract structured data
        const entities = extractEntities(note.transcript_text, note.title);

        // Update the note with generated summary and entities
        await db.update(notesTable)
            .set({
                summary_text,
                entities,
                updated_at: new Date()
            })
            .where(eq(notesTable.id, input.note_id))
            .execute();

        return {
            summary_text,
            entities
        };
    } catch (error) {
        console.error('Meeting finalization failed:', error);
        throw error;
    }
};

// Helper function to generate meeting summary
function generateSummary(transcript: string): string {
    // Simulate AI-generated summary based on transcript content
    const words = transcript.split(' ');
    const wordCount = words.length;
    
    if (wordCount < 50) {
        return `Brief meeting discussion covering ${wordCount} words of content. Key topics discussed based on transcript analysis.`;
    } else if (wordCount < 200) {
        return `Meeting discussion covering ${wordCount} words. Multiple topics were covered with detailed discussion points and participant contributions.`;
    } else {
        return `Comprehensive meeting discussion with ${wordCount} words of detailed content. Extensive coverage of topics with in-depth participant engagement and multiple decision points.`;
    }
}

// Helper function to extract entities from transcript
function extractEntities(transcript: string, title: string): Record<string, any> {
    const entities: Record<string, any> = {
        decisions: [],
        risks: [],
        people: [],
        dates: [],
        action_items: [],
        topics: []
    };

    const lowerTranscript = transcript.toLowerCase();
    const words = transcript.split(/\s+/);

    // Extract decisions (look for decision keywords)
    const decisionKeywords = ['decided', 'agreed', 'resolved', 'concluded'];
    decisionKeywords.forEach(keyword => {
        if (lowerTranscript.includes(keyword)) {
            entities['decisions'].push(`Decision identified related to: ${keyword}`);
        }
    });

    // Extract risks (look for risk keywords)
    const riskKeywords = ['risk', 'concern', 'issue', 'problem', 'challenge'];
    riskKeywords.forEach(keyword => {
        if (lowerTranscript.includes(keyword)) {
            entities['risks'].push(`Risk identified: ${keyword} mentioned in discussion`);
        }
    });

    // Extract people (look for common name patterns)
    const namePatterns = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
    const potentialNames = transcript.match(namePatterns) || [];
    entities['people'] = [...new Set(potentialNames)].slice(0, 10); // Dedupe and limit

    // Extract dates (look for date patterns)
    const datePatterns = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{1,2}-\d{1,2}-\d{4}\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi;
    const dates = transcript.match(datePatterns) || [];
    entities['dates'] = [...new Set(dates)];

    // Extract action items (look for action keywords)
    const actionKeywords = ['todo', 'action', 'follow up', 'next step', 'will do'];
    actionKeywords.forEach(keyword => {
        if (lowerTranscript.includes(keyword)) {
            entities['action_items'].push(`Action item: ${keyword} mentioned`);
        }
    });

    // Extract topics from title and common meeting words
    entities['topics'].push(title);
    const topicKeywords = ['project', 'budget', 'timeline', 'strategy', 'planning'];
    topicKeywords.forEach(keyword => {
        if (lowerTranscript.includes(keyword)) {
            entities['topics'].push(keyword);
        }
    });

    return entities;
}