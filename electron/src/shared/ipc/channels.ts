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
  'ai.deleteProvocation',
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

export const IPC_EVENT_CHANNELS = ['settings.open'] as const;

export type IpcEventChannel = (typeof IPC_EVENT_CHANNELS)[number];

export const SETTINGS_OPEN_EVENT: IpcEventChannel = 'settings.open';
