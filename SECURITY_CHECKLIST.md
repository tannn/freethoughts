# Security Checklist (TFT-018)

This checklist maps Electron security baseline requirements to concrete implementation evidence in this repository.

## FR-060 `contextIsolation` enabled

- Evidence: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/main/window/security.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`

## FR-061 `sandbox` enabled

- Evidence: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/main/window/security.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`

## FR-062 `nodeIntegration` disabled

- Evidence: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/main/window/security.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`

## FR-063 `webSecurity` enabled

- Evidence: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/main/window/security.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`

## FR-064 `enableRemoteModule` disabled

- Evidence: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/main/window/security.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`

## FR-065 preload + `contextBridge` API exposure only

- Evidence:
  - `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/preload/index.ts`
  - `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/preload/api.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`

## FR-066 allowlisted channels + runtime payload validation

- Evidence:
  - `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/shared/ipc/channels.ts`
  - `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/shared/ipc/schemas.ts`
  - `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/main/ipc/registerHandlers.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`

## FR-067 strict CSP with narrow `connect-src`

- Evidence: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/main/window/security.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`

## FR-068 deny untrusted window creation/navigation

- Evidence: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/main/window/security.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`

## FR-069 deny permission requests by default

- Evidence: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/src/main/window/security.ts`
- Verification: `/Users/tanner/Documents/experimental/ideas/toolsforthought/freethoughts/test/security.checklist.test.ts`
