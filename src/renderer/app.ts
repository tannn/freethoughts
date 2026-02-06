import { getDesktopApi } from './desktopApi.js';

type ErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type SuccessEnvelope<T> = {
  ok: true;
  data: T;
};

type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

type ProvocationStyle = 'skeptical' | 'creative' | 'methodological';

interface NetworkStatus {
  online: boolean;
  checkedAt: string;
}

interface SettingsSnapshot {
  generationModel: string;
  defaultProvocationStyle: ProvocationStyle;
  apiKeyConfigured: boolean;
}

const networkStatusElement = document.querySelector<HTMLSpanElement>('#network-status');
const apiKeyStatusElement = document.querySelector<HTMLSpanElement>('#api-key-status');
const modelStatusElement = document.querySelector<HTMLSpanElement>('#model-status');
const styleStatusElement = document.querySelector<HTMLSpanElement>('#style-status');
const messageLogElement = document.querySelector<HTMLPreElement>('#message-log');
const refreshButton = document.querySelector<HTMLButtonElement>('#refresh-button');
const settingsForm = document.querySelector<HTMLFormElement>('#settings-form');
const generationModelInput = document.querySelector<HTMLInputElement>('#generation-model-input');
const provocationStyleInput = document.querySelector<HTMLSelectElement>('#provocation-style-input');
const apiKeyInput = document.querySelector<HTMLInputElement>('#api-key-input');
const clearApiKeyInput = document.querySelector<HTMLInputElement>('#clear-api-key-input');

const fail = (message: string): never => {
  throw new Error(message);
};

const required = <T>(value: T | null, name: string): T => value ?? fail(`Missing DOM node: ${name}`);

const appendLog = (line: string): void => {
  const log = required(messageLogElement, 'message-log');
  const timestamp = new Date().toISOString();
  log.textContent = `${timestamp} ${line}\n${log.textContent ?? ''}`.trimEnd();
};

const parseEnvelope = <T>(envelope: Envelope<T>): T => {
  if (envelope.ok) {
    return envelope.data;
  }

  throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
};

const loadSnapshot = async (): Promise<void> => {
  const desktopApi = getDesktopApi(window as unknown as Record<string, unknown>);
  const networkEnvelope = (await desktopApi.network.status({})) as Envelope<NetworkStatus>;
  const settingsEnvelope = (await desktopApi.settings.get({})) as Envelope<SettingsSnapshot>;

  const network = parseEnvelope(networkEnvelope);
  const settings = parseEnvelope(settingsEnvelope);

  required(networkStatusElement, 'network-status').textContent = network.online
    ? `online (${network.checkedAt})`
    : 'offline';
  required(apiKeyStatusElement, 'api-key-status').textContent = settings.apiKeyConfigured
    ? 'configured'
    : 'not configured';
  required(modelStatusElement, 'model-status').textContent = settings.generationModel;
  required(styleStatusElement, 'style-status').textContent = settings.defaultProvocationStyle;

  required(generationModelInput, 'generation-model-input').value = settings.generationModel;
  required(provocationStyleInput, 'provocation-style-input').value = settings.defaultProvocationStyle;
};

const saveSettings = async (): Promise<void> => {
  const desktopApi = getDesktopApi(window as unknown as Record<string, unknown>);
  const model = required(generationModelInput, 'generation-model-input').value.trim();
  const style = required(provocationStyleInput, 'provocation-style-input').value as ProvocationStyle;
  const apiKey = required(apiKeyInput, 'api-key-input').value.trim();
  const clearApiKey = required(clearApiKeyInput, 'clear-api-key-input').checked;

  if (clearApiKey && apiKey) {
    throw new Error('Choose either a new API key or "Clear saved API key", not both.');
  }

  const payload: {
    generationModel: string;
    defaultProvocationStyle: ProvocationStyle;
    openAiApiKey?: string;
    clearOpenAiApiKey?: boolean;
  } = {
    generationModel: model,
    defaultProvocationStyle: style
  };

  if (apiKey) {
    payload.openAiApiKey = apiKey;
  }

  if (clearApiKey) {
    payload.clearOpenAiApiKey = true;
  }

  const updateEnvelope = (await desktopApi.settings.update(payload)) as Envelope<SettingsSnapshot>;
  parseEnvelope(updateEnvelope);
  required(apiKeyInput, 'api-key-input').value = '';
  required(clearApiKeyInput, 'clear-api-key-input').checked = false;
};

const wireUi = (): void => {
  required(refreshButton, 'refresh-button').addEventListener('click', async () => {
    try {
      await loadSnapshot();
      appendLog('Refreshed runtime status.');
    } catch (error) {
      appendLog(error instanceof Error ? error.message : String(error));
    }
  });

  required(settingsForm, 'settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveSettings();
      await loadSnapshot();
      appendLog('Settings saved.');
    } catch (error) {
      appendLog(error instanceof Error ? error.message : String(error));
    }
  });
};

const bootstrap = async (): Promise<void> => {
  wireUi();
  try {
    await loadSnapshot();
    appendLog('Desktop shell loaded.');
  } catch (error) {
    appendLog(error instanceof Error ? error.message : String(error));
  }
};

void bootstrap();
