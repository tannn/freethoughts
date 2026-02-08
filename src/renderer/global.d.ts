import type { DesktopApi } from '../preload/api.js';
import { PRELOAD_API_KEY } from '../preload/index.js';

declare global {
  interface Window {
    [PRELOAD_API_KEY]: DesktopApi;
  }
}

export {};
