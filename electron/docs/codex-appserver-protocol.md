# Codex App Server Generation Contract (Phase 13)

This note defines the Codex App Server contract subset used by provocation generation in `codex_subscription` mode.

## Transport

- Protocol: JSON-RPC 2.0 over stdio.
- Runtime command: `codex app-server`.
- Message framing: one JSON object per line.

## Request Flow (generation)

1. `initialize`
2. `thread/start`
3. `turn/start` (contains prompt input)
4. `turn/interrupt` (optional cancellation path)

## Request / Response Envelope Mapping

- Request: `{ "jsonrpc": "2.0", "id", "method", "params" }`
- Success: `{ "jsonrpc": "2.0", "id", "result" }`
- Error: `{ "jsonrpc": "2.0", "id", "error": { "code", "message", "data?" } }`
- Notification: `{ "jsonrpc": "2.0", "method", "params" }`

## Generation Result Extraction

The client listens to generation notifications and extracts final text from:

- `item/completed` notifications containing `agentMessage` text
- `turn/completed` notifications as completion boundary

If completion arrives without any assistant text, the client treats it as malformed output.

## Error Mapping Requirements

Client-side mapping must preserve JSON-RPC error details and convert them to app-level `AppError` envelopes:

- Runtime unavailable / inaccessible -> `E_PROVIDER` + `action: switch_to_api_key`
- Permission / scope denied -> `E_UNAUTHORIZED` + `action: switch_to_api_key`
- Malformed protocol payloads -> `E_PROVIDER` with protocol context
