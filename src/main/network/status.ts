import { net } from 'electron';
import { AppError } from '../../shared/ipc/errors.js';

export interface OnlineProvider {
  isOnline(): boolean;
}

export interface NetworkStatusSnapshot {
  online: boolean;
  checkedAt: string;
}

const defaultProvider: OnlineProvider = {
  isOnline: () => net.isOnline()
};

export const getNetworkStatus = (provider: OnlineProvider = defaultProvider): NetworkStatusSnapshot => ({
  online: provider.isOnline(),
  checkedAt: new Date().toISOString()
});

export const assertOnline = (provider: OnlineProvider = defaultProvider): void => {
  if (!provider.isOnline()) {
    throw new AppError('E_OFFLINE', 'AI actions disabled while offline.');
  }
};
