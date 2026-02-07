import { z } from 'zod';
import type { IpcChannel } from './channels.js';

const id = z.string().trim().min(1);
const provocationStyle = z.enum(['skeptical', 'creative', 'methodological']);
const authMode = z.enum(['api_key', 'codex_subscription']);

export const IPC_SCHEMA_BY_CHANNEL: Record<IpcChannel, z.ZodTypeAny> = {
  'workspace.open': z.object({ workspacePath: z.string().trim().min(1) }).strict(),
  'workspace.create': z.object({ workspacePath: z.string().trim().min(1) }).strict(),
  'workspace.selectPath': z.object({ mode: z.enum(['open', 'create']) }).strict(),
  'document.import': z.object({ sourcePath: z.string().trim().min(1) }).strict(),
  'document.selectSource': z.object({}).strict(),
  'document.reimport': z.object({ documentId: id }).strict(),
  'document.locate': z.object({ documentId: id, sourcePath: z.string().trim().min(1) }).strict(),
  'section.list': z.object({ documentId: id }).strict(),
  'section.get': z.object({ sectionId: id }).strict(),
  'note.create': z
    .object({
      documentId: id,
      sectionId: id,
      text: z.string(),
      paragraphOrdinal: z.number().int().nonnegative().optional(),
      startOffset: z.number().int().nonnegative().optional(),
      endOffset: z.number().int().nonnegative().optional(),
      selectedTextExcerpt: z.string().trim().min(1).optional()
    })
    .strict(),
  'note.update': z.object({ noteId: id, text: z.string() }).strict(),
  'note.delete': z.object({ noteId: id }).strict(),
  'note.reassign': z.object({ noteId: id, targetSectionId: id }).strict(),
  'ai.generateProvocation': z
    .object({
      requestId: id,
      documentId: id,
      sectionId: id,
      noteId: id.optional(),
      style: provocationStyle.optional(),
      confirmReplace: z.boolean().optional(),
      acknowledgeCloudWarning: z.boolean().optional()
    })
    .strict(),
  'ai.cancel': z.union([
    z.object({ requestId: id }).strict(),
    z.object({ documentId: id, sectionId: id, dismissActive: z.literal(true) }).strict()
  ]),
  'ai.deleteProvocation': z.object({ provocationId: id }).strict(),
  'settings.get': z.object({}).strict(),
  'settings.update': z
    .object({
      generationModel: z.string().trim().min(1).optional(),
      defaultProvocationStyle: provocationStyle.optional(),
      openAiApiKey: z.string().trim().min(1).optional(),
      clearOpenAiApiKey: z.boolean().optional(),
      documentId: id.optional(),
      provocationsEnabled: z.boolean().optional()
    })
    .strict(),
  'network.status': z.object({}).strict(),
  'auth.status': z.object({}).strict(),
  'auth.loginStart': z.object({}).strict(),
  'auth.loginComplete': z.object({ correlationState: id }).strict(),
  'auth.logout': z.object({}).strict(),
  'auth.switchMode': z.object({ mode: authMode }).strict()
};
