import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  type MenuItemConstructorOptions
} from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FetchOpenAiTransport } from '../ai/index.js';
import { createDefaultBusinessHandlers, registerValidatedIpcHandlers } from './ipc/index.js';
import { MacOsKeychainApiKeyProvider } from './security/index.js';
import { SETTINGS_OPEN_EVENT } from '../shared/ipc/channels.js';
import {
  CONTENT_SECURITY_POLICY,
  MAIN_WINDOW_WEB_PREFERENCES,
  isTrustedNavigation,
  shouldAttachContentSecurityPolicy,
  shouldAllowPermission,
  shouldAllowWindowOpen
} from './window/index.js';
import { applyAllMigrations } from '../persistence/migrations/index.js';
import { AppError } from '../shared/ipc/errors.js';
import {
  CodexCliAppServerTransport,
  CodexCliSubscriptionAuthAdapter,
  DesktopRuntime,
  type GenerateProvocationPayload,
  type RuntimeApiKeyProvider,
  type UpdateSettingsPayload
} from './runtime/index.js';

app.setName('Free Thoughts');

class UnsupportedPlatformApiKeyProvider implements RuntimeApiKeyProvider {
  private unsupported(message: string): never {
    throw new AppError('E_INTERNAL', message);
  }

  async getApiKey(): Promise<string> {
    throw new AppError('E_UNAUTHORIZED', 'Missing OpenAI API key');
  }

  setApiKey(): void {
    this.unsupported('OpenAI API key management is only supported on macOS');
  }

  hasApiKey(): boolean {
    return false;
  }

  deleteApiKey(): boolean {
    return false;
  }
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(currentDir, '..', 'preload', 'electronPreload.cjs');
const rendererPath = join(currentDir, '..', 'renderer', 'index.html');
const rendererDocumentUrl = pathToFileURL(rendererPath).toString();
const dbPath = join(app.getPath('userData'), 'toolsforthought.sqlite');
const openAiResponseLogPath = join(app.getPath('userData'), 'openai-responses.log');
const codexRuntimeLogPath = join(app.getPath('userData'), 'codex-runtime.log');

const createApiKeyProvider = (): RuntimeApiKeyProvider => {
  if (process.platform === 'darwin') {
    return new MacOsKeychainApiKeyProvider();
  }

  return new UnsupportedPlatformApiKeyProvider();
};

const createRuntime = (): DesktopRuntime => {
  applyAllMigrations(dbPath);
  return new DesktopRuntime({
    dbPath,
    apiKeyProvider: createApiKeyProvider(),
    codexAuthAdapter: new CodexCliSubscriptionAuthAdapter({
      logPath: codexRuntimeLogPath
    }),
    codexAppServerTransport: new CodexCliAppServerTransport({
      logPath: codexRuntimeLogPath
    }),
    openAiTransport: new FetchOpenAiTransport({
      logPath: openAiResponseLogPath
    })
  });
};

const registerMainIpc = (runtime: DesktopRuntime): void => {
  const handlers = createDefaultBusinessHandlers();
  const getMainWindow = (): BrowserWindow => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      throw new AppError('E_INTERNAL', 'Main window not available for selection.');
    }
    return window;
  };

  handlers['workspace.open'] = (payload) =>
    runtime.openWorkspace((payload as { workspacePath: string }).workspacePath);
  handlers['workspace.create'] = (payload) =>
    runtime.createWorkspace((payload as { workspacePath: string }).workspacePath);
  handlers['workspace.selectPath'] = async (payload) => {
    const { mode } = payload as { mode: 'open' | 'create' };
    const selection = await dialog.showOpenDialog(getMainWindow(), {
      title: mode === 'open' ? 'Open Workspace' : 'Create Workspace',
      properties: mode === 'open' ? ['openDirectory'] : ['openDirectory', 'createDirectory']
    });

    return {
      workspacePath: selection.canceled ? null : (selection.filePaths[0] ?? null)
    };
  };
  handlers['document.import'] = (payload) =>
    runtime.importDocument((payload as { sourcePath: string }).sourcePath);
  handlers['document.selectSource'] = async () => {
    const selection = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import Document',
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'txt', 'md'] }]
    });

    return {
      sourcePath: selection.canceled ? null : (selection.filePaths[0] ?? null)
    };
  };
  handlers['document.reimport'] = (payload) =>
    runtime.reimportDocument((payload as { documentId: string }).documentId);
  handlers['document.locate'] = (payload) =>
    runtime.locateDocument(
      (payload as { documentId: string; sourcePath: string }).documentId,
      (payload as { documentId: string; sourcePath: string }).sourcePath
    );
  handlers['section.list'] = (payload) =>
    runtime.listSections((payload as { documentId: string }).documentId);
  handlers['section.get'] = (payload) => runtime.getSection((payload as { sectionId: string }).sectionId);
  handlers['note.create'] = (payload) =>
    runtime.createNote(payload as { documentId: string; sectionId: string; text: string });
  handlers['note.update'] = (payload) => runtime.updateNote(payload as { noteId: string; text: string });
  handlers['note.delete'] = (payload) => runtime.deleteNote(payload as { noteId: string });
  handlers['note.reassign'] = (payload) =>
    runtime.reassignNote(payload as { noteId: string; targetSectionId: string });
  handlers['ai.generateProvocation'] = (payload) =>
    runtime.generateProvocation(payload as GenerateProvocationPayload);
  handlers['ai.cancel'] = (payload) =>
    runtime.cancelAiRequest(
      payload as { requestId: string } | { documentId: string; sectionId: string; dismissActive: true }
    );
  handlers['ai.deleteProvocation'] = (payload) =>
    runtime.deleteProvocation(payload as { provocationId: string });
  handlers['settings.get'] = () => runtime.getSettings();
  handlers['settings.update'] = (payload) => runtime.updateSettings(payload as UpdateSettingsPayload);
  handlers['network.status'] = () => runtime.getNetworkStatus();
  handlers['auth.status'] = () => runtime.getAuthStatus();
  handlers['auth.loginStart'] = async () => {
    const loginStart = await runtime.startAuthLogin();
    try {
      await shell.openExternal(loginStart.authUrl);
    } catch {
      // URL is still returned for manual launch if external open fails.
    }
    return loginStart;
  };
  handlers['auth.loginComplete'] = (payload) =>
    runtime.completeAuthLogin((payload as { correlationState: string }).correlationState);
  handlers['auth.logout'] = () => runtime.logoutAuth();
  handlers['auth.switchMode'] = (payload) =>
    runtime.switchAuthMode((payload as { mode: 'api_key' | 'codex_subscription' }).mode);

  registerValidatedIpcHandlers(ipcMain, handlers);
};

const configureSecurityGuards = (): void => {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: shouldAllowWindowOpen() ? 'allow' : 'deny' }));

    contents.on('will-navigate', (event, targetUrl) => {
      const currentUrl = contents.getURL() || `file://${rendererPath}`;
      if (!isTrustedNavigation(targetUrl, currentUrl)) {
        event.preventDefault();
      }
    });
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(shouldAllowPermission());
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders ?? {};
    if (
      shouldAttachContentSecurityPolicy(details.url, details.resourceType, rendererDocumentUrl)
    ) {
      responseHeaders['Content-Security-Policy'] = [CONTENT_SECURITY_POLICY];
    }
    callback({ responseHeaders });
  });
};

const openSettingsFromMenu = (): void => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) {
    return;
  }
  window.webContents.send(SETTINGS_OPEN_EVENT);
};

const configureAppMenu = (): void => {
  if (process.platform !== 'darwin') {
    return;
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CommandOrControl+,',
          click: () => openSettingsFromMenu()
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'Free Thoughts',
    webPreferences: {
      ...MAIN_WINDOW_WEB_PREFERENCES,
      preload: preloadPath
    }
  });

  void window.loadFile(rendererPath);
  return window;
};

const bootstrap = async (): Promise<void> => {
  await app.whenReady();
  configureAppMenu();
  configureSecurityGuards();
  registerMainIpc(createRuntime());
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
};

void bootstrap();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
