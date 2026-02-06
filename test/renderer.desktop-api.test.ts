import { describe, expect, it } from 'vitest';
import { getDesktopApi } from '../src/renderer/desktopApi.js';

describe('renderer desktop preload bridge', () => {
  it('returns the bridge object when required namespaces exist', () => {
    const api = {
      workspace: { open: async () => ({ ok: true, data: null }), create: async () => ({ ok: true, data: null }) },
      document: {
        import: async () => ({ ok: true, data: null }),
        reimport: async () => ({ ok: true, data: null }),
        locate: async () => ({ ok: true, data: null })
      },
      section: { list: async () => ({ ok: true, data: null }), get: async () => ({ ok: true, data: null }) },
      note: {
        create: async () => ({ ok: true, data: null }),
        update: async () => ({ ok: true, data: null }),
        delete: async () => ({ ok: true, data: null }),
        reassign: async () => ({ ok: true, data: null })
      },
      ai: {
        generateProvocation: async () => ({ ok: true, data: null }),
        cancel: async () => ({ ok: true, data: null })
      },
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
