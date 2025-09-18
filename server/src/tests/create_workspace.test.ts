import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { workspacesTable, usersTable } from '../db/schema';
import { type CreateWorkspaceInput } from '../schema';
import { createWorkspace } from '../handlers/create_workspace';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'test@example.com',
  display_name: 'Test User',
  timezone: 'Australia/Adelaide',
  llm_provider: 'openai',
  llm_model: 'gpt-4.1'
};

describe('createWorkspace', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let userId: string;

  beforeEach(async () => {
    // Create a test user first since workspace needs owner_id
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;
  });

  it('should create a workspace with minimal input', async () => {
    const testInput: CreateWorkspaceInput = {
      owner_id: userId,
      name: 'Test Workspace'
    };

    const result = await createWorkspace(testInput);

    // Basic field validation
    expect(result.name).toEqual('Test Workspace');
    expect(result.owner_id).toEqual(userId);
    expect(result.settings).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create a workspace with settings', async () => {
    const testInput: CreateWorkspaceInput = {
      owner_id: userId,
      name: 'Workspace with Settings',
      settings: {
        theme: 'dark',
        notifications: true,
        timezone: 'UTC'
      }
    };

    const result = await createWorkspace(testInput);

    expect(result.name).toEqual('Workspace with Settings');
    expect(result.owner_id).toEqual(userId);
    expect(result.settings).toEqual({
      theme: 'dark',
      notifications: true,
      timezone: 'UTC'
    });
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save workspace to database', async () => {
    const testInput: CreateWorkspaceInput = {
      owner_id: userId,
      name: 'Database Test Workspace',
      settings: { test: true }
    };

    const result = await createWorkspace(testInput);

    // Query the database to verify the workspace was saved
    const workspaces = await db.select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, result.id))
      .execute();

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toEqual('Database Test Workspace');
    expect(workspaces[0].owner_id).toEqual(userId);
    expect(workspaces[0].settings).toEqual({ test: true });
    expect(workspaces[0].created_at).toBeInstanceOf(Date);
  });

  it('should handle null settings correctly', async () => {
    const testInput: CreateWorkspaceInput = {
      owner_id: userId,
      name: 'Workspace No Settings',
      settings: null
    };

    const result = await createWorkspace(testInput);

    expect(result.settings).toBeNull();

    // Verify in database
    const workspaces = await db.select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, result.id))
      .execute();

    expect(workspaces[0].settings).toBeNull();
  });

  it('should fail when owner_id references non-existent user', async () => {
    const testInput: CreateWorkspaceInput = {
      owner_id: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
      name: 'Invalid Owner Workspace'
    };

    await expect(createWorkspace(testInput)).rejects.toThrow(/violates foreign key constraint/i);
  });

  it('should create multiple workspaces for same owner', async () => {
    const testInput1: CreateWorkspaceInput = {
      owner_id: userId,
      name: 'First Workspace'
    };

    const testInput2: CreateWorkspaceInput = {
      owner_id: userId,
      name: 'Second Workspace'
    };

    const result1 = await createWorkspace(testInput1);
    const result2 = await createWorkspace(testInput2);

    expect(result1.id).not.toEqual(result2.id);
    expect(result1.owner_id).toEqual(userId);
    expect(result2.owner_id).toEqual(userId);
    expect(result1.name).toEqual('First Workspace');
    expect(result2.name).toEqual('Second Workspace');

    // Verify both exist in database
    const workspaces = await db.select()
      .from(workspacesTable)
      .where(eq(workspacesTable.owner_id, userId))
      .execute();

    expect(workspaces).toHaveLength(2);
  });
});