import { AppError } from '../shared/ipc/errors.js';
import type { ProvocationStyle } from './types.js';
import { AiSettingsRepository } from './settingsRepository.js';

export interface AiSettingsSnapshot {
  generationModel: string;
  defaultProvocationStyle: ProvocationStyle;
  apiKeyConfigured: boolean;
}

export interface UpdateAiSettingsInput {
  generationModel?: string;
  defaultProvocationStyle?: ProvocationStyle;
  openAiApiKey?: string;
  clearOpenAiApiKey?: boolean;
}

export interface ApiKeyManagementProvider {
  setApiKey(apiKey: string): void;
  hasApiKey(): boolean;
  deleteApiKey(): boolean;
}

export class AiSettingsService {
  constructor(
    private readonly settingsRepository: AiSettingsRepository,
    private readonly apiKeyProvider: ApiKeyManagementProvider
  ) {}

  getSettings(): AiSettingsSnapshot {
    const workspaceSettings = this.settingsRepository.getWorkspaceSettings();
    return {
      ...workspaceSettings,
      apiKeyConfigured: this.apiKeyProvider.hasApiKey()
    };
  }

  updateSettings(input: UpdateAiSettingsInput): AiSettingsSnapshot {
    if (input.openAiApiKey !== undefined && input.clearOpenAiApiKey === true) {
      throw new AppError('E_VALIDATION', 'Cannot set and clear OpenAI API key in one request');
    }

    if (input.openAiApiKey !== undefined) {
      this.apiKeyProvider.setApiKey(input.openAiApiKey);
    } else if (input.clearOpenAiApiKey === true) {
      this.apiKeyProvider.deleteApiKey();
    }

    if (input.generationModel !== undefined || input.defaultProvocationStyle !== undefined) {
      this.settingsRepository.updateWorkspaceSettings({
        generationModel: input.generationModel,
        defaultProvocationStyle: input.defaultProvocationStyle
      });
    }

    return this.getSettings();
  }
}
