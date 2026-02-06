import { app, BrowserWindow, ipcMain, session } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AiSettingsRepository,
  AiSettingsService,
  type ApiKeyManagementProvider,
  type UpdateAiSettingsInput
} from '../ai/index.js';
import { createDefaultBusinessHandlers, registerValidatedIpcHandlers } from './ipc/index.js';
import { MacOsKeychainApiKeyProvider } from './security/index.js';
import {
  CONTENT_SECURITY_POLICY,
  MAIN_WINDOW_WEB_PREFERENCES,
  isTrustedNavigation,
  shouldAllowPermission,
  shouldAllowWindowOpen
} from './window/index.js';
import { assertOnline, getNetworkStatus } from './network/status.js';
import { applyAllMigrations } from '../persistence/migrations/index.js';
import { IPC_CHANNELS } from '../shared/ipc/channels.js';
import { AppError } from '../shared/ipc/errors.js';

class UnsupportedPlatformApiKeyProvider implements ApiKeyManagementProvider {
  private unsupported(): never {
    throw new AppError('E_INTERNAL', 'OpenAI API key management is only supported on macOS');
  }

  setApiKey(): void {
    this.unsupported();
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

const createApiKeyProvider = (): ApiKeyManagementProvider => {
  if (process.platform === 'darwin') {
    return new MacOsKeychainApiKeyProvider();
  }

  return new UnsupportedPlatformApiKeyProvider();
};

const createSettingsService = (): AiSettingsService => {
  applyAllMigrations(dbPath);
  const settingsRepository = new AiSettingsRepository(dbPath);
  return new AiSettingsService(settingsRepository, createApiKeyProvider());
};

const registerMainIpc = (settingsService: AiSettingsService): void => {
  const handlers = createDefaultBusinessHandlers();

  for (const channel of IPC_CHANNELS) {
    handlers[channel] = () => {
      throw new AppError('E_CONFLICT', 'IPC channel is not wired in desktop bootstrap', { channel });
    };
  }

  handlers['settings.get'] = () => settingsService.getSettings();
  handlers['settings.update'] = (payload) =>
    settingsService.updateSettings(payload as UpdateAiSettingsInput);
  handlers['ai.generateProvocation'] = () => {
    assertOnline();
    throw new AppError('E_CONFLICT', 'IPC channel is not wired in desktop bootstrap', {
      channel: 'ai.generateProvocation'
    });
  };
  handlers['network.status'] = () => getNetworkStatus();

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
  registerMainIpc(createSettingsService());
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
