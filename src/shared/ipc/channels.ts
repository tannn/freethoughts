export const IPC_CHANNELS = [
  'workspace.open',
  'workspace.create',
  'workspace.selectPath',
  'document.import',
  'document.selectSource',
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
  'network.status',
  'auth.status',
  'auth.loginStart',
  'auth.loginComplete',
  'auth.logout',
  'auth.switchMode'
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];
