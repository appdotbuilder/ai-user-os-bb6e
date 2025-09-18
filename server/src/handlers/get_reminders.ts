import { db } from '../db';
import { remindersTable } from '../db/schema';
import { type Reminder } from '../schema';
import { eq } from 'drizzle-orm';

export const getReminders = async (taskId?: string): Promise<Reminder[]> => {
  try {
    // Build query conditionally
    if (taskId) {
      const results = await db.select()
        .from(remindersTable)
        .where(eq(remindersTable.task_id, taskId))
        .execute();
      return results;
    } else {
      const results = await db.select()
        .from(remindersTable)
        .execute();
      return results;
    }
  } catch (error) {
    console.error('Get reminders failed:', error);
    throw error;
  }
};