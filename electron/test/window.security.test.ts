import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  MAIN_WINDOW_WEB_PREFERENCES,
  isTrustedNavigation,
  shouldAttachContentSecurityPolicy,
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
      enableRemoteModule: false,
      plugins: true
    });
  });

  it('defines strict CSP with narrow connect-src', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self' https://api.openai.com");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-src 'self' file: chrome-extension:");
  });

  it('applies CSP header only to the app main-frame document', () => {
    const rendererUrl = 'file:///Applications/FreeThought/dist/renderer/index.html';
    expect(shouldAttachContentSecurityPolicy(rendererUrl, 'mainFrame', rendererUrl)).toBe(true);
    expect(shouldAttachContentSecurityPolicy(rendererUrl, 'subFrame', rendererUrl)).toBe(false);
    expect(
      shouldAttachContentSecurityPolicy(
        'file:///Users/tanner/Documents/reading/my-paper.pdf',
        'mainFrame',
        rendererUrl
      )
    ).toBe(false);
    expect(shouldAttachContentSecurityPolicy('not-a-url', 'mainFrame', rendererUrl)).toBe(false);
  });

  it('denies untrusted navigation/window creation/permissions by default', () => {
    expect(isTrustedNavigation('https://app.local/reader', 'https://app.local/index.html')).toBe(true);
    expect(isTrustedNavigation('https://malicious.example/phish', 'https://app.local/index.html')).toBe(false);
    expect(isTrustedNavigation('not-a-url', 'https://app.local/index.html')).toBe(false);
    expect(shouldAllowWindowOpen()).toBe(false);
    expect(shouldAllowPermission()).toBe(false);
  });
});
