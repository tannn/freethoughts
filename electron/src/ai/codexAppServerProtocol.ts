export type CodexAppServerJsonRpcId = string | number;

export interface CodexAppServerJsonRpcRequest<TMethod extends string, TParams> {
  jsonrpc: '2.0';
  id: CodexAppServerJsonRpcId;
  method: TMethod;
  params: TParams;
}

export interface CodexAppServerJsonRpcSuccess<TResult> {
  jsonrpc: '2.0';
  id: CodexAppServerJsonRpcId;
  result: TResult;
}

export interface CodexAppServerJsonRpcErrorEnvelope {
  code: number;
  message: string;
  data?: unknown;
}

export interface CodexAppServerJsonRpcError {
  jsonrpc: '2.0';
  id: CodexAppServerJsonRpcId | null;
  error: CodexAppServerJsonRpcErrorEnvelope;
}

export interface CodexAppServerJsonRpcNotification<TMethod extends string, TParams> {
  jsonrpc: '2.0';
  method: TMethod;
  params: TParams;
}

export interface CodexAppServerInitializeParams {
  clientInfo: {
    name: string;
    version: string;
  };
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
}

export type CodexAppServerInitializeRequest = CodexAppServerJsonRpcRequest<
  'initialize',
  CodexAppServerInitializeParams
>;

export type CodexAppServerInitializeResponse = CodexAppServerJsonRpcSuccess<{
  protocolVersion?: string;
  serverInfo?: {
    name?: string;
    version?: string;
  };
}>;

export interface CodexAppServerThreadStartParams {
  model?: string | null;
  modelProvider?: string | null;
  cwd?: string | null;
}

export interface CodexAppServerThreadStartResult {
  thread: {
    id: string;
  };
}

export type CodexAppServerThreadStartRequest = CodexAppServerJsonRpcRequest<
  'thread/start',
  CodexAppServerThreadStartParams
>;

export type CodexAppServerThreadStartResponse = CodexAppServerJsonRpcSuccess<CodexAppServerThreadStartResult>;

export type CodexAppServerTurnInput = {
  type: 'text';
  text: string;
};

export interface CodexAppServerTurnStartParams {
  threadId: string;
  input: CodexAppServerTurnInput[];
  model?: string | null;
}

export interface CodexAppServerTurnStartResult {
  turn: {
    id: string;
  };
}

export type CodexAppServerTurnStartRequest = CodexAppServerJsonRpcRequest<
  'turn/start',
  CodexAppServerTurnStartParams
>;

export type CodexAppServerTurnStartResponse = CodexAppServerJsonRpcSuccess<CodexAppServerTurnStartResult>;

export interface CodexAppServerTurnInterruptParams {
  threadId: string;
  turnId: string;
}

export type CodexAppServerTurnInterruptRequest = CodexAppServerJsonRpcRequest<
  'turn/interrupt',
  CodexAppServerTurnInterruptParams
>;

export type CodexAppServerTurnInterruptResponse = CodexAppServerJsonRpcSuccess<Record<string, never>>;

export interface CodexAppServerAgentMessageItem {
  id: string;
  type: 'agentMessage';
  text: string;
}

export interface CodexAppServerTurn {
  id: string;
  status: 'inProgress' | 'completed' | 'interrupted' | 'failed';
  error?: {
    message: string;
    additionalDetails?: string | null;
    codexErrorInfo?: unknown;
  } | null;
}

export type CodexAppServerItemCompletedNotification = CodexAppServerJsonRpcNotification<
  'item/completed',
  {
    threadId: string;
    turnId: string;
    item: CodexAppServerAgentMessageItem | Record<string, unknown>;
  }
>;

export type CodexAppServerTurnCompletedNotification = CodexAppServerJsonRpcNotification<
  'turn/completed',
  {
    threadId: string;
    turn: CodexAppServerTurn;
  }
>;

export type CodexAppServerProtocolNotification =
  | CodexAppServerItemCompletedNotification
  | CodexAppServerTurnCompletedNotification;

export type CodexAppServerProtocolRequest =
  | CodexAppServerInitializeRequest
  | CodexAppServerThreadStartRequest
  | CodexAppServerTurnStartRequest
  | CodexAppServerTurnInterruptRequest;

export type CodexAppServerProtocolResponse =
  | CodexAppServerInitializeResponse
  | CodexAppServerThreadStartResponse
  | CodexAppServerTurnStartResponse
  | CodexAppServerTurnInterruptResponse
  | CodexAppServerJsonRpcError;
