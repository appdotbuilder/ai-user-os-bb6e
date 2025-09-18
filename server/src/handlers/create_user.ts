import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type User } from '../schema';

export const createUser = async (input: CreateUserInput): Promise<User> => {
  try {
    // Insert user record
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        display_name: input.display_name,
        timezone: input.timezone, // Zod default: 'Australia/Adelaide'
        llm_provider: input.llm_provider, // Zod default: 'openai'
        llm_model: input.llm_model // Zod default: 'gpt-4.1'
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
};