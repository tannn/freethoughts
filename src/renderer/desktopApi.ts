import type { DesktopApi } from '../preload/api.js';
import { PRELOAD_API_KEY } from '../preload/index.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getDesktopApi = (host: Record<string, unknown>): DesktopApi => {
  const api = host[PRELOAD_API_KEY];
  if (!isRecord(api)) {
    throw new Error(`Desktop preload API "${PRELOAD_API_KEY}" is unavailable.`);
  }

  if (!isRecord(api.settings) || !isRecord(api.network)) {
    throw new Error(`Desktop preload API "${PRELOAD_API_KEY}" is incomplete.`);
  }

  return api as unknown as DesktopApi;
};
