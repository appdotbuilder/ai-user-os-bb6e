import { uuid, text, pgTable, timestamp, json, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define enums
export const noteSourceEnum = pgEnum('note_source', ['manual', 'meeting', 'import']);
export const taskStatusEnum = pgEnum('task_status', ['todo', 'doing', 'done']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'med', 'high']);
export const reminderMethodEnum = pgEnum('reminder_method', ['app_push', 'email', 'calendar']);
export const reminderStatusEnum = pgEnum('reminder_status', ['scheduled', 'sent', 'cancelled']);
export const agentEventStatusEnum = pgEnum('agent_event_status', ['draft', 'awaiting_confirmation', 'executed', 'error']);

// Users table
export const usersTable = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  display_name: text('display_name').notNull(),
  timezone: text('timezone').notNull().default('Australia/Adelaide'),
  llm_provider: text('llm_provider').notNull().default('openai'),
  llm_model: text('llm_model').notNull().default('gpt-4.1'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Workspaces table
export const workspacesTable = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  owner_id: uuid('owner_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  settings: json('settings'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Notes table
export const notesTable = pgTable('notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspace_id: uuid('workspace_id').notNull().references(() => workspacesTable.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  source: noteSourceEnum('source').notNull(),
  content_md: text('content_md'),
  transcript_text: text('transcript_text'),
  summary_text: text('summary_text'),
  entities: json('entities'),
  created_by: uuid('created_by').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Tasks table
export const tasksTable = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspace_id: uuid('workspace_id').notNull().references(() => workspacesTable.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('todo'),
  priority: taskPriorityEnum('priority').notNull().default('med'),
  due_at: timestamp('due_at'),
  assignee_id: uuid('assignee_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  linked_note_id: uuid('linked_note_id').references(() => notesTable.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Reminders table
export const remindersTable = pgTable('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  task_id: uuid('task_id').notNull().references(() => tasksTable.id, { onDelete: 'cascade' }),
  remind_at: timestamp('remind_at').notNull(),
  method: reminderMethodEnum('method').notNull().default('app_push'),
  status: reminderStatusEnum('status').notNull().default('scheduled'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Agent events table
export const agentEventsTable = pgTable('agent_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspace_id: uuid('workspace_id').notNull().references(() => workspacesTable.id, { onDelete: 'cascade' }),
  agent: text('agent').notNull(),
  action: text('action').notNull(),
  input: json('input'),
  output: json('output'),
  status: agentEventStatusEnum('status').notNull().default('draft'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Define relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  ownedWorkspaces: many(workspacesTable),
  notes: many(notesTable),
  assignedTasks: many(tasksTable),
}));

export const workspacesRelations = relations(workspacesTable, ({ one, many }) => ({
  owner: one(usersTable, {
    fields: [workspacesTable.owner_id],
    references: [usersTable.id],
  }),
  notes: many(notesTable),
  tasks: many(tasksTable),
  agentEvents: many(agentEventsTable),
}));

export const notesRelations = relations(notesTable, ({ one, many }) => ({
  workspace: one(workspacesTable, {
    fields: [notesTable.workspace_id],
    references: [workspacesTable.id],
  }),
  creator: one(usersTable, {
    fields: [notesTable.created_by],
    references: [usersTable.id],
  }),
  linkedTasks: many(tasksTable),
}));

export const tasksRelations = relations(tasksTable, ({ one, many }) => ({
  workspace: one(workspacesTable, {
    fields: [tasksTable.workspace_id],
    references: [workspacesTable.id],
  }),
  assignee: one(usersTable, {
    fields: [tasksTable.assignee_id],
    references: [usersTable.id],
  }),
  linkedNote: one(notesTable, {
    fields: [tasksTable.linked_note_id],
    references: [notesTable.id],
  }),
  reminders: many(remindersTable),
}));

export const remindersRelations = relations(remindersTable, ({ one }) => ({
  task: one(tasksTable, {
    fields: [remindersTable.task_id],
    references: [tasksTable.id],
  }),
}));

export const agentEventsRelations = relations(agentEventsTable, ({ one }) => ({
  workspace: one(workspacesTable, {
    fields: [agentEventsTable.workspace_id],
    references: [workspacesTable.id],
  }),
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Workspace = typeof workspacesTable.$inferSelect;
export type NewWorkspace = typeof workspacesTable.$inferInsert;
export type Note = typeof notesTable.$inferSelect;
export type NewNote = typeof notesTable.$inferInsert;
export type Task = typeof tasksTable.$inferSelect;
export type NewTask = typeof tasksTable.$inferInsert;
export type Reminder = typeof remindersTable.$inferSelect;
export type NewReminder = typeof remindersTable.$inferInsert;
export type AgentEvent = typeof agentEventsTable.$inferSelect;
export type NewAgentEvent = typeof agentEventsTable.$inferInsert;

// Export all tables for relation queries
export const tables = {
  users: usersTable,
  workspaces: workspacesTable,
  notes: notesTable,
  tasks: tasksTable,
  reminders: remindersTable,
  agentEvents: agentEventsTable,
};