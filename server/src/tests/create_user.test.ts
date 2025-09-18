import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

// Test input with all fields including defaults
const testInput: CreateUserInput = {
  email: 'test@example.com',
  display_name: 'Test User',
  timezone: 'Australia/Adelaide',
  llm_provider: 'openai',
  llm_model: 'gpt-4.1'
};

// Test input with explicit defaults to verify Zod parsing would work
const explicitDefaultsInput: CreateUserInput = {
  email: 'minimal@example.com',
  display_name: 'Minimal User',
  timezone: 'Australia/Adelaide',
  llm_provider: 'openai',
  llm_model: 'gpt-4.1'
};

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user with all fields', async () => {
    const result = await createUser(testInput);

    // Basic field validation
    expect(result.email).toEqual('test@example.com');
    expect(result.display_name).toEqual('Test User');
    expect(result.timezone).toEqual('Australia/Adelaide');
    expect(result.llm_provider).toEqual('openai');
    expect(result.llm_model).toEqual('gpt-4.1');
    expect(result.id).toBeDefined();
    expect(typeof result.id).toEqual('string');
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create a user with explicit default values', async () => {
    const result = await createUser(explicitDefaultsInput);

    // Verify explicit defaults match schema defaults
    expect(result.email).toEqual('minimal@example.com');
    expect(result.display_name).toEqual('Minimal User');
    expect(result.timezone).toEqual('Australia/Adelaide'); // Schema default
    expect(result.llm_provider).toEqual('openai'); // Schema default
    expect(result.llm_model).toEqual('gpt-4.1'); // Schema default
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save user to database', async () => {
    const result = await createUser(testInput);

    // Query using proper drizzle syntax
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].display_name).toEqual('Test User');
    expect(users[0].timezone).toEqual('Australia/Adelaide');
    expect(users[0].llm_provider).toEqual('openai');
    expect(users[0].llm_model).toEqual('gpt-4.1');
    expect(users[0].created_at).toBeInstanceOf(Date);
  });

  it('should generate unique IDs for different users', async () => {
    const input1: CreateUserInput = {
      email: 'user1@example.com',
      display_name: 'User One',
      timezone: 'Australia/Adelaide',
      llm_provider: 'openai',
      llm_model: 'gpt-4.1'
    };
    
    const input2: CreateUserInput = {
      email: 'user2@example.com',
      display_name: 'User Two',
      timezone: 'Australia/Adelaide',
      llm_provider: 'openai',
      llm_model: 'gpt-4.1'
    };

    const result1 = await createUser(input1);
    const result2 = await createUser(input2);

    expect(result1.id).not.toEqual(result2.id);
    expect(result1.email).toEqual('user1@example.com');
    expect(result2.email).toEqual('user2@example.com');
  });

  it('should throw error for duplicate email', async () => {
    // Create first user
    await createUser(testInput);

    // Attempt to create user with same email
    const duplicateInput: CreateUserInput = {
      email: 'test@example.com', // Same email
      display_name: 'Another User',
      timezone: 'Australia/Adelaide',
      llm_provider: 'openai',
      llm_model: 'gpt-4.1'
    };

    await expect(createUser(duplicateInput)).rejects.toThrow(/duplicate key value violates unique constraint/i);
  });

  it('should validate created_at timestamp is recent', async () => {
    const before = new Date();
    const result = await createUser(testInput);
    const after = new Date();

    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.created_at.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});