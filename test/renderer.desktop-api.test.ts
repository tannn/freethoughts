import { describe, expect, it } from 'vitest';
import { getDesktopApi } from '../src/renderer/desktopApi.js';

describe('renderer desktop preload bridge', () => {
  it('returns the bridge object when required namespaces exist', () => {
    const api = {
      settings: { get: async () => ({ ok: true, data: null }) },
      network: { status: async () => ({ ok: true, data: null }) }
    };

    const resolved = getDesktopApi({ tft: api });
    expect(resolved).toBe(api);
  });

  it('throws a clear error when bridge is missing', () => {
    expect(() => getDesktopApi({})).toThrow('Desktop preload API "tft" is unavailable.');
  });

  it('throws a clear error when bridge is incomplete', () => {
    expect(() => getDesktopApi({ tft: {} })).toThrow('Desktop preload API "tft" is incomplete.');
  });
});
