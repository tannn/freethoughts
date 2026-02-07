import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FetchOpenAiTransport } from '../ai/index.js';
import { createDefaultBusinessHandlers, registerValidatedIpcHandlers } from './ipc/index.js';
import { MacOsKeychainApiKeyProvider } from './security/index.js';
import {
  CONTENT_SECURITY_POLICY,
  MAIN_WINDOW_WEB_PREFERENCES,
  isTrustedNavigation,
  shouldAllowPermission,
  shouldAllowWindowOpen
} from './window/index.js';
import { applyAllMigrations } from '../persistence/migrations/index.js';
import { AppError } from '../shared/ipc/errors.js';
import {
  CodexCliSubscriptionAuthAdapter,
  DesktopRuntime,
  type GenerateProvocationPayload,
  type RuntimeApiKeyProvider,
  type UpdateSettingsPayload
} from './runtime/index.js';

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
const dbPath = join(app.getPath('userData'), 'toolsforthought.sqlite');
const openAiResponseLogPath = join(app.getPath('userData'), 'openai-responses.log');

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
    codexAuthAdapter: new CodexCliSubscriptionAuthAdapter(),
    openAiTransport: new FetchOpenAiTransport({
      logPath: openAiResponseLogPath
    })
  });
};

const registerMainIpc = (runtime: DesktopRuntime): void => {
  const handlers = createDefaultBusinessHandlers();
  handlers['workspace.open'] = (payload) =>
    runtime.openWorkspace((payload as { workspacePath: string }).workspacePath);
  handlers['workspace.create'] = (payload) =>
    runtime.createWorkspace((payload as { workspacePath: string }).workspacePath);
  handlers['document.import'] = (payload) =>
    runtime.importDocument((payload as { sourcePath: string }).sourcePath);
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
    responseHeaders['Content-Security-Policy'] = [CONTENT_SECURITY_POLICY];
    callback({ responseHeaders });
  });
};

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'Tools for Thought',
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
