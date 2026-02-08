export const MAIN_WINDOW_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  enableRemoteModule: false,
  // Keep plugins enabled for renderer compatibility while PDF content is rendered via local PDF.js.
  plugins: true
});

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  // Retained to avoid CSP regressions during PDF.js migration and local file fallback handling.
  "frame-src 'self' file: chrome-extension:",
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

export const shouldAttachContentSecurityPolicy = (
  requestUrl: string,
  resourceType: string,
  rendererDocumentUrl: string
): boolean => {
  if (resourceType !== 'mainFrame') {
    return false;
  }

  try {
    const request = new URL(requestUrl);
    const renderer = new URL(rendererDocumentUrl);
    return request.protocol === renderer.protocol && request.pathname === renderer.pathname;
  } catch {
    return false;
  }
};

export const shouldAllowWindowOpen = (): boolean => false;

export const shouldAllowPermission = (): boolean => false;
