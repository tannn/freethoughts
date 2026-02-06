export const IPC_CHANNELS = [
  'workspace.open',
  'workspace.create',
  'document.import',
  'document.reimport',
  'document.locate',
  'section.list',
  'section.get',
  'note.create',
  'note.update',
  'note.delete',
  'note.reassign',
  'ai.generateProvocation',
  'ai.cancel',
  'settings.get',
  'settings.update',
  'network.status'
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];
