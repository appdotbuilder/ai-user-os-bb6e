import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import { 
  createUserInputSchema,
  createWorkspaceInputSchema,
  createNoteInputSchema,
  updateNoteInputSchema,
  createTaskInputSchema,
  updateTaskInputSchema,
  createReminderInputSchema,
  transcribeMeetingInputSchema,
  finalizeMeetingInputSchema,
  createCalendarEventInputSchema,
  agentProposeInputSchema,
  agentConfirmInputSchema,
  createAgentEventInputSchema,
  updateAgentEventInputSchema,
  taskStatusSchema
} from './schema';

// Import handlers
import { createUser } from './handlers/create_user';
import { createWorkspace } from './handlers/create_workspace';
import { getUserWorkspaces } from './handlers/get_user_workspaces';
import { createNote } from './handlers/create_note';
import { updateNote } from './handlers/update_note';
import { getNotes } from './handlers/get_notes';
import { createTask } from './handlers/create_task';
import { updateTask } from './handlers/update_task';
import { getTasks } from './handlers/get_tasks';
import { createReminder } from './handlers/create_reminder';
import { getReminders } from './handlers/get_reminders';
import { transcribeMeeting } from './handlers/transcribe_meeting';
import { finalizeMeeting } from './handlers/finalize_meeting';
import { createCalendarEvent } from './handlers/create_calendar_event';
import { createAgentEvent } from './handlers/create_agent_event';
import { updateAgentEvent } from './handlers/update_agent_event';
import { getAgentEvents } from './handlers/get_agent_events';
import { agentPropose } from './handlers/agent_propose';
import { agentConfirm } from './handlers/agent_confirm';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User management
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  // Workspace management
  createWorkspace: publicProcedure
    .input(createWorkspaceInputSchema)
    .mutation(({ input }) => createWorkspace(input)),

  getUserWorkspaces: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => getUserWorkspaces(input.userId)),

  // Note management
  createNote: publicProcedure
    .input(createNoteInputSchema)
    .mutation(({ input }) => createNote(input)),

  updateNote: publicProcedure
    .input(updateNoteInputSchema)
    .mutation(({ input }) => updateNote(input)),

  getNotes: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(({ input }) => getNotes(input.workspaceId)),

  // Task management
  createTask: publicProcedure
    .input(createTaskInputSchema)
    .mutation(({ input }) => createTask(input)),

  updateTask: publicProcedure
    .input(updateTaskInputSchema)
    .mutation(({ input }) => updateTask(input)),

  getTasks: publicProcedure
    .input(z.object({ 
      workspaceId: z.string(),
      status: taskStatusSchema.optional()
    }))
    .query(({ input }) => getTasks(input.workspaceId, input.status)),

  // Reminder management
  createReminder: publicProcedure
    .input(createReminderInputSchema)
    .mutation(({ input }) => createReminder(input)),

  getReminders: publicProcedure
    .input(z.object({ taskId: z.string().optional() }))
    .query(({ input }) => getReminders(input.taskId)),

  // Meeting transcription
  transcribeMeeting: publicProcedure
    .input(transcribeMeetingInputSchema)
    .mutation(({ input }) => transcribeMeeting(input)),

  finalizeMeeting: publicProcedure
    .input(finalizeMeetingInputSchema)
    .mutation(({ input }) => finalizeMeeting(input)),

  // Calendar integration
  createCalendarEvent: publicProcedure
    .input(createCalendarEventInputSchema)
    .mutation(({ input }) => createCalendarEvent(input)),

  // Agent system
  createAgentEvent: publicProcedure
    .input(createAgentEventInputSchema)
    .mutation(({ input }) => createAgentEvent(input)),

  updateAgentEvent: publicProcedure
    .input(updateAgentEventInputSchema)
    .mutation(({ input }) => updateAgentEvent(input)),

  getAgentEvents: publicProcedure
    .input(z.object({ 
      workspaceId: z.string(),
      status: z.enum(['draft', 'awaiting_confirmation', 'executed', 'error']).optional()
    }))
    .query(({ input }) => getAgentEvents(input.workspaceId, input.status)),

  agentPropose: publicProcedure
    .input(agentProposeInputSchema.extend({ workspaceId: z.string() }))
    .mutation(({ input }) => agentPropose(input, input.workspaceId)),

  agentConfirm: publicProcedure
    .input(agentConfirmInputSchema)
    .mutation(({ input }) => agentConfirm(input)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();