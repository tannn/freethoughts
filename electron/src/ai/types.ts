export const PROVOCATION_STYLES = ['skeptical', 'creative', 'methodological'] as const;

export type ProvocationStyle = (typeof PROVOCATION_STYLES)[number];

export interface WorkspaceAiSettings {
  generationModel: string;
  defaultProvocationStyle: ProvocationStyle;
}

export interface DocumentAiSettings {
  documentId: string;
  provocationsEnabled: boolean;
}

export const DEFAULT_AI_SETTINGS: WorkspaceAiSettings = {
  generationModel: 'gpt-4.1-mini',
  defaultProvocationStyle: 'skeptical'
};

export const DEFAULT_INPUT_TOKEN_BUDGET = 3000;
export const DEFAULT_OUTPUT_TOKEN_BUDGET = 120;
