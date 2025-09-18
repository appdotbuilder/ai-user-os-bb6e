import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { type CreateCalendarEventInput } from '../schema';
import { createCalendarEvent } from '../handlers/create_calendar_event';

// Test input with all required fields
const testInput: CreateCalendarEventInput = {
  title: 'Team Meeting',
  start: new Date('2024-01-15T10:00:00Z'),
  end: new Date('2024-01-15T11:00:00Z'),
  attendees: ['john@example.com', 'jane@example.com']
};

// Minimal test input
const minimalInput: CreateCalendarEventInput = {
  title: 'Solo Work Session',
  start: new Date('2024-01-15T14:00:00Z'),
  end: new Date('2024-01-15T15:00:00Z')
};

describe('createCalendarEvent', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a calendar event draft', async () => {
    const result = await createCalendarEvent(testInput);

    // Validate returned calendar event structure
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.title).toEqual('Team Meeting');
    expect(result.start).toEqual(new Date('2024-01-15T10:00:00Z'));
    expect(result.end).toEqual(new Date('2024-01-15T11:00:00Z'));
    expect(result.attendees).toEqual(['john@example.com', 'jane@example.com']);
    expect(result.status).toEqual('draft');
  });

  it('should create calendar event without attendees', async () => {
    const result = await createCalendarEvent(minimalInput);

    expect(result.title).toEqual('Solo Work Session');
    expect(result.start).toEqual(new Date('2024-01-15T14:00:00Z'));
    expect(result.end).toEqual(new Date('2024-01-15T15:00:00Z'));
    expect(result.attendees).toBeUndefined();
    expect(result.status).toEqual('draft');
  });

  it('should generate valid UUID for event ID', async () => {
    const result = await createCalendarEvent(testInput);

    // Validate UUID format (8-4-4-4-12 characters)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(result.id)).toBe(true);
  });

  it('should handle empty attendees array', async () => {
    const inputWithEmptyAttendees: CreateCalendarEventInput = {
      title: 'Personal Reminder',
      start: new Date('2024-01-16T09:00:00Z'),
      end: new Date('2024-01-16T09:30:00Z'),
      attendees: []
    };

    const result = await createCalendarEvent(inputWithEmptyAttendees);

    expect(result.attendees).toEqual([]);
    expect(result.title).toEqual('Personal Reminder');
    expect(result.status).toEqual('draft');
  });

  it('should generate unique IDs for multiple events', async () => {
    const result1 = await createCalendarEvent(testInput);
    const result2 = await createCalendarEvent(minimalInput);

    expect(result1.id).not.toEqual(result2.id);
    expect(result1.id.length).toBeGreaterThan(0);
    expect(result2.id.length).toBeGreaterThan(0);

    // Validate both IDs are valid UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(result1.id)).toBe(true);
    expect(uuidRegex.test(result2.id)).toBe(true);
  });

  it('should handle date objects correctly', async () => {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    
    const inputWithCurrentDates: CreateCalendarEventInput = {
      title: 'Current Time Meeting',
      start: now,
      end: oneHourLater
    };

    const result = await createCalendarEvent(inputWithCurrentDates);

    expect(result.start).toEqual(now);
    expect(result.end).toEqual(oneHourLater);
    expect(result.title).toEqual('Current Time Meeting');
    expect(result.status).toEqual('draft');

    // Verify dates are Date objects, not strings
    expect(result.start).toBeInstanceOf(Date);
    expect(result.end).toBeInstanceOf(Date);
  });

  it('should handle long titles and large attendee lists', async () => {
    const longTitle = 'A'.repeat(200); // 200 character title
    const manyAttendees = Array.from({ length: 50 }, (_, i) => `user${i}@example.com`);

    const inputWithLargeData: CreateCalendarEventInput = {
      title: longTitle,
      start: new Date('2024-01-15T10:00:00Z'),
      end: new Date('2024-01-15T12:00:00Z'),
      attendees: manyAttendees
    };

    const result = await createCalendarEvent(inputWithLargeData);

    expect(result.title).toEqual(longTitle);
    expect(result.attendees).toEqual(manyAttendees);
    expect(result.attendees).toHaveLength(50);
    expect(result.status).toEqual('draft');
  });

  it('should preserve special characters in title and attendees', async () => {
    const specialTitle = 'Meeting: Q&A Session (重要) - 50% Complete! 🎉';
    const specialAttendees = [
      'josé.garcía@example.com',
      'user+tag@example.co.uk',
      'test_user-123@sub.domain.org'
    ];

    const inputWithSpecialChars: CreateCalendarEventInput = {
      title: specialTitle,
      start: new Date('2024-01-15T10:00:00Z'),
      end: new Date('2024-01-15T11:00:00Z'),
      attendees: specialAttendees
    };

    const result = await createCalendarEvent(inputWithSpecialChars);

    expect(result.title).toEqual(specialTitle);
    expect(result.attendees).toEqual(specialAttendees);
    expect(result.status).toEqual('draft');
  });
});