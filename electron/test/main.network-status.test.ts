import { describe, expect, it } from 'vitest';
import { assertOnline, getNetworkStatus } from '../src/main/network/status.js';
import { AppError } from '../src/shared/ipc/errors.js';

describe('main network status', () => {
  it('reports online status from provider', () => {
    const status = getNetworkStatus({
      isOnline: () => false
    });

    expect(status.online).toBe(false);
    expect(typeof status.checkedAt).toBe('string');
    expect(Number.isNaN(Date.parse(status.checkedAt))).toBe(false);
  });

  it('throws E_OFFLINE when online assertions fail', () => {
    let thrown: unknown;
    try {
      assertOnline({
        isOnline: () => false
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('E_OFFLINE');
  });
});
