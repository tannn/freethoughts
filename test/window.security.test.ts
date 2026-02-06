import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  MAIN_WINDOW_WEB_PREFERENCES,
  isTrustedNavigation,
  shouldAllowPermission,
  shouldAllowWindowOpen
} from '../src/main/window/security.js';

describe('electron security baseline defaults', () => {
  it('enforces required webPreferences flags', () => {
    expect(MAIN_WINDOW_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      enableRemoteModule: false
    });
  });

  it('defines strict CSP with narrow connect-src', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self' https://api.openai.com");
  });

  it('denies untrusted navigation/window creation/permissions by default', () => {
    expect(isTrustedNavigation('https://app.local/reader', 'https://app.local/index.html')).toBe(true);
    expect(isTrustedNavigation('https://malicious.example/phish', 'https://app.local/index.html')).toBe(false);
    expect(isTrustedNavigation('not-a-url', 'https://app.local/index.html')).toBe(false);
    expect(shouldAllowWindowOpen()).toBe(false);
    expect(shouldAllowPermission()).toBe(false);
  });
});
