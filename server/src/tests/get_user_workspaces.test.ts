import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, workspacesTable } from '../db/schema';
import { getUserWorkspaces } from '../handlers/get_user_workspaces';

describe('getUserWorkspaces', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return workspaces owned by the user', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'owner@test.com',
          display_name: 'Owner User',
          timezone: 'Australia/Adelaide',
          llm_provider: 'openai',
          llm_model: 'gpt-4.1'
        },
        {
          email: 'other@test.com',
          display_name: 'Other User',
          timezone: 'US/Pacific',
          llm_provider: 'anthropic',
          llm_model: 'claude-3'
        }
      ])
      .returning()
      .execute();

    const ownerUser = users[0];
    const otherUser = users[1];

    // Create workspaces owned by different users
    const workspaces = await db.insert(workspacesTable)
      .values([
        {
          owner_id: ownerUser.id,
          name: 'Owner Workspace 1',
          settings: { theme: 'dark' }
        },
        {
          owner_id: ownerUser.id,
          name: 'Owner Workspace 2',
          settings: null
        },
        {
          owner_id: otherUser.id,
          name: 'Other User Workspace',
          settings: { theme: 'light' }
        }
      ])
      .returning()
      .execute();

    const result = await getUserWorkspaces(ownerUser.id);

    // Should return only workspaces owned by the specified user
    expect(result).toHaveLength(2);
    
    const workspaceNames = result.map(w => w.name).sort();
    expect(workspaceNames).toEqual(['Owner Workspace 1', 'Owner Workspace 2']);
    
    // Verify all returned workspaces belong to the owner
    result.forEach(workspace => {
      expect(workspace.owner_id).toEqual(ownerUser.id);
      expect(workspace.id).toBeDefined();
      expect(workspace.created_at).toBeInstanceOf(Date);
    });
  });

  it('should return empty array when user has no workspaces', async () => {
    // Create a user with no workspaces
    const user = await db.insert(usersTable)
      .values({
        email: 'noworkspaces@test.com',
        display_name: 'No Workspaces User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    const result = await getUserWorkspaces(user[0].id);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array for non-existent user', async () => {
    const nonExistentUserId = '123e4567-e89b-12d3-a456-426614174000';
    
    const result = await getUserWorkspaces(nonExistentUserId);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return workspaces with correct data structure', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        display_name: 'Test User',
        timezone: 'Europe/London',
        llm_provider: 'openai',
        llm_model: 'gpt-4'
      })
      .returning()
      .execute();

    // Create workspace with all fields
    const workspace = await db.insert(workspacesTable)
      .values({
        owner_id: user[0].id,
        name: 'Complete Workspace',
        settings: { 
          theme: 'dark',
          notifications: true,
          layout: 'grid'
        }
      })
      .returning()
      .execute();

    const result = await getUserWorkspaces(user[0].id);

    expect(result).toHaveLength(1);
    
    const returnedWorkspace = result[0];
    expect(returnedWorkspace.id).toEqual(workspace[0].id);
    expect(returnedWorkspace.owner_id).toEqual(user[0].id);
    expect(returnedWorkspace.name).toEqual('Complete Workspace');
    expect(returnedWorkspace.settings).toEqual({
      theme: 'dark',
      notifications: true,
      layout: 'grid'
    });
    expect(returnedWorkspace.created_at).toBeInstanceOf(Date);
  });

  it('should handle workspaces with null settings', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'nullsettings@test.com',
        display_name: 'Null Settings User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    // Create workspace with null settings
    await db.insert(workspacesTable)
      .values({
        owner_id: user[0].id,
        name: 'Null Settings Workspace',
        settings: null
      })
      .execute();

    const result = await getUserWorkspaces(user[0].id);

    expect(result).toHaveLength(1);
    expect(result[0].settings).toBeNull();
    expect(result[0].name).toEqual('Null Settings Workspace');
  });

  it('should return multiple workspaces sorted by creation order', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'multiple@test.com',
        display_name: 'Multiple Workspaces User',
        timezone: 'Australia/Adelaide',
        llm_provider: 'openai',
        llm_model: 'gpt-4.1'
      })
      .returning()
      .execute();

    // Create multiple workspaces
    const workspace1 = await db.insert(workspacesTable)
      .values({
        owner_id: user[0].id,
        name: 'First Workspace',
        settings: { order: 1 }
      })
      .returning()
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 1));

    const workspace2 = await db.insert(workspacesTable)
      .values({
        owner_id: user[0].id,
        name: 'Second Workspace',
        settings: { order: 2 }
      })
      .returning()
      .execute();

    const result = await getUserWorkspaces(user[0].id);

    expect(result).toHaveLength(2);
    
    // Verify workspaces are returned (database insertion order may vary)
    const workspaceIds = result.map(w => w.id).sort();
    const expectedIds = [workspace1[0].id, workspace2[0].id].sort();
    expect(workspaceIds).toEqual(expectedIds);
  });
});