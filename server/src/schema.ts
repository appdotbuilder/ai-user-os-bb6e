import { z } from 'zod';

// Enums
export const noteSourceSchema = z.enum(['manual', 'meeting', 'import']);
export const taskStatusSchema = z.enum(['todo', 'doing', 'done']);
export const taskPrioritySchema = z.enum(['low', 'med', 'high']);
export const reminderMethodSchema = z.enum(['app_push', 'email', 'calendar']);
export const reminderStatusSchema = z.enum(['scheduled', 'sent', 'cancelled']);
export const agentEventStatusSchema = z.enum(['draft', 'awaiting_confirmation', 'executed', 'error']);
export const userRoleSchema = z.enum(['owner', 'member']);

// Base schemas
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  display_name: z.string(),
  timezone: z.string(),
  llm_provider: z.string(),
  llm_model: z.string(),
  created_at: z.coerce.date()
});

export const workspaceSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  name: z.string(),
  settings: z.record(z.any()).nullable(),
  created_at: z.coerce.date()
});

export const noteSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  title: z.string(),
  source: noteSourceSchema,
  content_md: z.string().nullable(),
  transcript_text: z.string().nullable(),
  summary_text: z.string().nullable(),
  entities: z.record(z.any()).nullable(),
  created_by: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const taskSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  due_at: z.coerce.date().nullable(),
  assignee_id: z.string(),
  linked_note_id: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export const reminderSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  remind_at: z.coerce.date(),
  method: reminderMethodSchema,
  status: reminderStatusSchema,
  created_at: z.coerce.date()
});

export const agentEventSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  agent: z.string(),
  action: z.string(),
  input: z.record(z.any()).nullable(),
  output: z.record(z.any()).nullable(),
  status: agentEventStatusSchema,
  created_at: z.coerce.date()
});

// Input schemas for creating records
export const createUserInputSchema = z.object({
  email: z.string().email(),
  display_name: z.string(),
  timezone: z.string().default('Australia/Adelaide'),
  llm_provider: z.string().default('openai'),
  llm_model: z.string().default('gpt-4.1')
});

export const createWorkspaceInputSchema = z.object({
  owner_id: z.string(),
  name: z.string(),
  settings: z.record(z.any()).nullable().optional()
});

export const createNoteInputSchema = z.object({
  workspace_id: z.string(),
  title: z.string(),
  source: noteSourceSchema,
  content_md: z.string().nullable().optional(),
  transcript_text: z.string().nullable().optional(),
  created_by: z.string()
});

export const createTaskInputSchema = z.object({
  workspace_id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  priority: taskPrioritySchema.default('med'),
  due_at: z.coerce.date().nullable().optional(),
  assignee_id: z.string(),
  linked_note_id: z.string().nullable().optional()
});

export const createReminderInputSchema = z.object({
  task_id: z.string(),
  remind_at: z.coerce.date(),
  method: reminderMethodSchema.default('app_push')
});

export const createAgentEventInputSchema = z.object({
  workspace_id: z.string(),
  agent: z.string(),
  action: z.string(),
  input: z.record(z.any()).nullable().optional(),
  output: z.record(z.any()).nullable().optional(),
  status: agentEventStatusSchema.default('draft')
});

// Update schemas
export const updateTaskInputSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  due_at: z.coerce.date().nullable().optional(),
  assignee_id: z.string().optional(),
  linked_note_id: z.string().nullable().optional()
});

export const updateNoteInputSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  content_md: z.string().nullable().optional(),
  transcript_text: z.string().nullable().optional(),
  summary_text: z.string().nullable().optional(),
  entities: z.record(z.any()).nullable().optional()
});

export const updateAgentEventInputSchema = z.object({
  id: z.string(),
  output: z.record(z.any()).nullable().optional(),
  status: agentEventStatusSchema.optional()
});

// Meeting specific schemas
export const transcribeMeetingInputSchema = z.object({
  audio_chunk: z.string(), // base64 encoded audio
  note_id: z.string().optional()
});

export const finalizeMeetingInputSchema = z.object({
  note_id: z.string()
});

// Calendar integration schemas
export const createCalendarEventInputSchema = z.object({
  title: z.string(),
  start: z.coerce.date(),
  end: z.coerce.date(),
  attendees: z.array(z.string()).optional()
});

// Agent proposal schemas
export const agentProposeInputSchema = z.object({
  agent: z.string(),
  input_json: z.record(z.any())
});

export const agentConfirmInputSchema = z.object({
  agent_event_id: z.string()
});

// Type exports
export type User = z.infer<typeof userSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;

export type NoteSource = z.infer<typeof noteSourceSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type ReminderMethod = z.infer<typeof reminderMethodSchema>;
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;
export type AgentEventStatus = z.infer<typeof agentEventStatusSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;

export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type CreateReminderInput = z.infer<typeof createReminderInputSchema>;
export type CreateAgentEventInput = z.infer<typeof createAgentEventInputSchema>;

export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;
export type UpdateAgentEventInput = z.infer<typeof updateAgentEventInputSchema>;

export type TranscribeMeetingInput = z.infer<typeof transcribeMeetingInputSchema>;
export type FinalizeMeetingInput = z.infer<typeof finalizeMeetingInputSchema>;
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventInputSchema>;
export type AgentProposeInput = z.infer<typeof agentProposeInputSchema>;
export type AgentConfirmInput = z.infer<typeof agentConfirmInputSchema>;