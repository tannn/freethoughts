import { existsSync } from 'node:fs';
import { AppError } from '../shared/ipc/errors.js';

export type SourceFileStatus =
  | {
      status: 'available';
      message: 'Source file available';
      actions: [];
    }
  | {
      status: 'missing';
      message: 'Source file not found at original path.';
      actions: ['Locate file', 'Re-import'];
    };

export interface AiActionAvailability {
  enabled: boolean;
  reason: 'ok' | 'offline' | 'provocations-disabled';
  message: string;
}

export const getSourceFileStatus = (sourcePath: string): SourceFileStatus => {
  if (existsSync(sourcePath)) {
    return {
      status: 'available',
      message: 'Source file available',
      actions: []
    };
  }

  return {
    status: 'missing',
    message: 'Source file not found at original path.',
    actions: ['Locate file', 'Re-import']
  };
};

export const getAiActionAvailability = (
  isOnline: boolean,
  provocationsEnabled: boolean
): AiActionAvailability => {
  if (!isOnline) {
    return {
      enabled: false,
      reason: 'offline',
      message: 'AI actions disabled while offline.'
    };
  }

  if (!provocationsEnabled) {
    return {
      enabled: false,
      reason: 'provocations-disabled',
      message: 'Provocations are disabled for this document.'
    };
  }

  return {
    enabled: true,
    reason: 'ok',
    message: 'AI actions available'
  };
};

export const assertAiActionAllowed = (
  isOnline: boolean,
  provocationsEnabled: boolean
): void => {
  const availability = getAiActionAvailability(isOnline, provocationsEnabled);

  if (availability.reason === 'offline') {
    throw new AppError('E_OFFLINE', availability.message);
  }

  if (availability.reason === 'provocations-disabled') {
    throw new AppError('E_CONFLICT', availability.message);
  }
};
