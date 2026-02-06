import { z } from 'zod';
import type { IpcChannel } from './channels.js';

const id = z.string().trim().min(1);
const provocationStyle = z.enum(['skeptical', 'creative', 'methodological']);

export const IPC_SCHEMA_BY_CHANNEL: Record<IpcChannel, z.ZodTypeAny> = {
  'workspace.open': z.object({ workspacePath: z.string().trim().min(1) }).strict(),
  'workspace.create': z.object({ workspacePath: z.string().trim().min(1) }).strict(),
  'document.import': z.object({ sourcePath: z.string().trim().min(1) }).strict(),
  'document.reimport': z.object({ documentId: id }).strict(),
  'document.locate': z.object({ documentId: id, sourcePath: z.string().trim().min(1) }).strict(),
  'section.list': z.object({ documentId: id }).strict(),
  'section.get': z.object({ sectionId: id }).strict(),
  'note.create': z.object({ documentId: id, sectionId: id, text: z.string() }).strict(),
  'note.update': z.object({ noteId: id, text: z.string() }).strict(),
  'note.delete': z.object({ noteId: id }).strict(),
  'note.reassign': z.object({ noteId: id, targetSectionId: id }).strict(),
  'ai.generateProvocation': z
    .object({
      requestId: id,
      documentId: id,
      sectionId: id,
      noteId: id.optional(),
      style: provocationStyle.optional()
    })
    .strict(),
  'ai.cancel': z.object({ requestId: id }).strict(),
  'settings.get': z.object({}).strict(),
  'settings.update': z
    .object({
      generationModel: z.string().trim().min(1).optional(),
      defaultProvocationStyle: provocationStyle.optional()
    })
    .strict(),
  'network.status': z.object({}).strict()
};
