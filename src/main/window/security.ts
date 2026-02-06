export const MAIN_WINDOW_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  enableRemoteModule: false
});

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.openai.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'"
].join('; ');

export const isTrustedNavigation = (targetUrl: string, appOrigin: string): boolean => {
  try {
    return new URL(targetUrl).origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
};

export const shouldAllowWindowOpen = (): boolean => false;

export const shouldAllowPermission = (): boolean => false;
