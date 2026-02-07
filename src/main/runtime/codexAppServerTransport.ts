import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { accessSync, appendFileSync, constants as fsConstants } from 'node:fs';
import { delimiter, isAbsolute } from 'node:path';
import {
  CodexAppServerTransportError,
  type CodexAppServerGenerationTransport,
  type CodexAppServerInitializeParams,
  type CodexAppServerJsonRpcError,
  type CodexAppServerThreadStartParams,
  type CodexAppServerTurnCompletion,
  type CodexAppServerTurnInterruptParams,
  type CodexAppServerTurnStartParams
} from '../../ai/index.js';

const jsonRpcVersion = '2.0' as const;
const CODEX_COMMAND_FALLBACK = 'codex';
const DEFAULT_CODEX_COMMAND_CANDIDATES = ['/opt/homebrew/bin/codex', '/usr/local/bin/codex'] as const;

interface PendingResponse {
  resolve: (value: unknown) => void;
  reject: (error: CodexAppServerTransportError) => void;
}

interface TurnState {
  outputText: string;
  completed: boolean;
  status: CodexAppServerTurnCompletion['turnStatus'];
  errorMessage?: string | null;
}

interface ProcessContext {
  child: ChildProcessWithoutNullStreams;
  pending: Map<number, PendingResponse>;
  nextRequestId: number;
  turnByKey: Map<string, TurnState>;
  waiterByKey: Map<string, (completion: CodexAppServerTurnCompletion) => void>;
  stderrLines: string[];
}

type SpawnLike = (
  command: string,
  args: readonly string[],
  options: {
    stdio: ['pipe', 'pipe', 'pipe'];
    cwd?: string;
  }
) => ChildProcessWithoutNullStreams;

export interface CodexCliAppServerTransportOptions {
  codexCommand?: string;
  codexArgs?: readonly string[];
  cwd?: string;
  logPath?: string;
  spawnImpl?: SpawnLike;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const toTurnKey = (threadId: string, turnId: string): string => `${threadId}:${turnId}`;

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const sanitizeForLog = (message: string): string =>
  message
    .replaceAll(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]')
    .replaceAll(/sk-[A-Za-z0-9_-]+/g, 'sk-[REDACTED]');

const isExecutable = (candidate: string): boolean => {
  try {
    accessSync(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveCodexCommand = (): string => {
  for (const candidate of DEFAULT_CODEX_COMMAND_CANDIDATES) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  const rawPath = process.env.PATH ?? '';
  for (const part of rawPath.split(delimiter)) {
    const directory = part.trim();
    if (!directory) {
      continue;
    }
    const candidate = `${directory}/codex`;
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  return CODEX_COMMAND_FALLBACK;
};

const classifyTransportError = (message: string): CodexAppServerTransportError['kind'] => {
  const normalized = message.toLowerCase();
  if (normalized.includes('permission denied') || normalized.includes('cannot access session files')) {
    return 'runtime_inaccessible';
  }
  if (
    normalized.includes('permission') ||
    normalized.includes('scope') ||
    normalized.includes('unauthorized')
  ) {
    return 'permission_denied';
  }
  if (normalized.includes('not found') || normalized.includes('failed to start') || normalized.includes('spawn')) {
    return 'runtime_unavailable';
  }
  return 'provider_error';
};

const errorFromJsonRpc = (error: CodexAppServerJsonRpcError): CodexAppServerTransportError => {
  const message = error.error.message?.trim() || 'Codex App Server request failed.';
  const kind = classifyTransportError(message);
  return new CodexAppServerTransportError(kind, message, {
    code: error.error.code,
    data: error.error.data
  });
};

const processExitError = (context: ProcessContext): CodexAppServerTransportError => {
  const stderr = context.stderrLines.join('\n').trim();
  const message = stderr || 'Codex App Server process exited unexpectedly.';
  return new CodexAppServerTransportError(classifyTransportError(message), message);
};

export class CodexCliAppServerTransport implements CodexAppServerGenerationTransport {
  private context: ProcessContext | null = null;

  private readonly codexCommand: string;

  private readonly codexArgs: readonly string[];

  private readonly cwd?: string;

  private readonly logPath?: string;

  private readonly spawnImpl: SpawnLike;

  constructor(options: CodexCliAppServerTransportOptions = {}) {
    const requestedCommand = options.codexCommand?.trim();
    if (requestedCommand) {
      this.codexCommand = isAbsolute(requestedCommand) ? requestedCommand : requestedCommand;
    } else {
      this.codexCommand = resolveCodexCommand();
    }
    this.codexArgs = options.codexArgs ?? ['app-server'];
    this.cwd = options.cwd;
    this.logPath = options.logPath;
    this.spawnImpl = options.spawnImpl ?? spawn;
    this.log('transport_init', {
      codexCommand: this.codexCommand,
      codexArgs: this.codexArgs
    });
  }

  async initialize(input: {
    params: CodexAppServerInitializeParams;
    signal: AbortSignal;
  }): Promise<void> {
    const context = this.createContext();
    this.context = context;
    this.log('initialize_start', {});
    try {
      await this.sendRequest(context, 'initialize', input.params, input.signal);
      this.log('initialize_ok', {});
    } catch (error) {
      this.log('initialize_error', {
        error: sanitizeForLog(error instanceof Error ? error.message : String(error))
      });
      this.shutdown(context);
      this.context = null;
      throw error;
    }
  }

  async startSession(input: {
    params: CodexAppServerThreadStartParams;
    signal: AbortSignal;
  }): Promise<{ threadId: string }> {
    const context = this.requireContext();
    const result = await this.sendRequest(context, 'thread/start', input.params, input.signal);
    const threadId = asString((result as { thread?: { id?: string } })?.thread?.id);
    if (!threadId) {
      throw new CodexAppServerTransportError(
        'protocol_error',
        'Codex App Server thread/start response is malformed.'
      );
    }
    this.log('thread_start_ok', { threadId });
    return { threadId };
  }

  async sendTurn(input: {
    params: CodexAppServerTurnStartParams;
    signal: AbortSignal;
  }): Promise<{ turnId: string }> {
    const context = this.requireContext();
    const result = await this.sendRequest(context, 'turn/start', input.params, input.signal);
    const turnId = asString((result as { turn?: { id?: string } })?.turn?.id);
    if (!turnId) {
      throw new CodexAppServerTransportError(
        'protocol_error',
        'Codex App Server turn/start response is malformed.'
      );
    }
    this.log('turn_start_ok', {
      threadId: input.params.threadId,
      turnId
    });
    const key = toTurnKey(input.params.threadId, turnId);
    const existing = context.turnByKey.get(key);
    if (!existing) {
      context.turnByKey.set(key, {
        outputText: '',
        completed: false,
        status: 'interrupted'
      });
    }
    return { turnId };
  }

  async waitForTurnCompletion(input: {
    threadId: string;
    turnId: string;
    signal: AbortSignal;
  }): Promise<CodexAppServerTurnCompletion> {
    const context = this.requireContext();
    const key = toTurnKey(input.threadId, input.turnId);
    const current = context.turnByKey.get(key);
    if (current?.completed) {
      const completion = {
        turnStatus: current.status,
        outputText: current.outputText || null,
        errorMessage: current.errorMessage ?? null
      } satisfies CodexAppServerTurnCompletion;
      this.shutdown(context);
      this.context = null;
      this.log('turn_completed_immediate', {
        threadId: input.threadId,
        turnId: input.turnId,
        turnStatus: completion.turnStatus
      });
      return completion;
    }

    return new Promise<CodexAppServerTurnCompletion>((resolve, reject) => {
      const onAbort = () => {
        context.waiterByKey.delete(key);
        reject(new CodexAppServerTransportError('provider_error', 'Codex App Server request aborted.'));
      };

      const finish = (completion: CodexAppServerTurnCompletion) => {
        input.signal.removeEventListener('abort', onAbort);
        this.shutdown(context);
        this.context = null;
        this.log('turn_completed', {
          threadId: input.threadId,
          turnId: input.turnId,
          turnStatus: completion.turnStatus
        });
        resolve(completion);
      };

      context.waiterByKey.set(key, finish);
      input.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async cancelTurn(input: { params: CodexAppServerTurnInterruptParams }): Promise<void> {
    const context = this.context;
    if (!context) {
      return;
    }

    try {
      this.log('turn_interrupt_start', {
        threadId: input.params.threadId,
        turnId: input.params.turnId
      });
      await this.sendRequest(
        context,
        'turn/interrupt',
        input.params,
        new AbortController().signal
      );
      this.log('turn_interrupt_ok', {
        threadId: input.params.threadId,
        turnId: input.params.turnId
      });
    } catch {
      this.log('turn_interrupt_error', {
        threadId: input.params.threadId,
        turnId: input.params.turnId
      });
      // best-effort cancellation
    } finally {
      this.shutdown(context);
      this.context = null;
    }
  }

  private createContext(): ProcessContext {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawnImpl(this.codexCommand, [...this.codexArgs], {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(this.cwd ? { cwd: this.cwd } : {})
      });
    } catch (error) {
      this.log('spawn_error', {
        codexCommand: this.codexCommand,
        error: sanitizeForLog(error instanceof Error ? error.message : String(error))
      });
      throw new CodexAppServerTransportError(
        'runtime_unavailable',
        `Failed to start Codex App Server: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    this.log('spawn_ok', { codexCommand: this.codexCommand });

    const context: ProcessContext = {
      child,
      pending: new Map(),
      nextRequestId: 1,
      turnByKey: new Map(),
      waiterByKey: new Map(),
      stderrLines: []
    };

    const onLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return;
      }

      this.handleMessage(context, parsed);
    };

    createInterface({ input: child.stdout }).on('line', onLine);
    createInterface({ input: child.stderr }).on('line', (line) => {
      const safeLine = sanitizeForLog(line);
      context.stderrLines.push(safeLine);
      if (context.stderrLines.length > 30) {
        context.stderrLines.shift();
      }
      this.log('stderr', { line: safeLine });
    });

    child.on('error', (error) => {
      this.log('process_error', { error: sanitizeForLog(error.message) });
      const transportError = new CodexAppServerTransportError(
        'runtime_unavailable',
        `Codex App Server process failed: ${error.message}`
      );
      for (const pending of context.pending.values()) {
        pending.reject(transportError);
      }
      context.pending.clear();
    });

    child.on('exit', (code, signal) => {
      this.log('process_exit', {
        code,
        signal: signal ?? null,
        stderrTail: context.stderrLines.slice(-10).join('\n')
      });
      const transportError = processExitError(context);
      for (const pending of context.pending.values()) {
        pending.reject(transportError);
      }
      context.pending.clear();
    });

    return context;
  }

  private requireContext(): ProcessContext {
    if (!this.context) {
      throw new CodexAppServerTransportError(
        'runtime_unavailable',
        'Codex App Server runtime unavailable.'
      );
    }
    return this.context;
  }

  private async sendRequest(
    context: ProcessContext,
    method: string,
    params: unknown,
    signal: AbortSignal
  ): Promise<unknown> {
    if (signal.aborted) {
      throw new CodexAppServerTransportError('provider_error', 'Codex App Server request aborted.');
    }

    const requestId = context.nextRequestId++;
    const payload = {
      jsonrpc: jsonRpcVersion,
      id: requestId,
      method,
      params
    };
    this.log('request_send', { id: requestId, method });

    const promise = new Promise<unknown>((resolve, reject) => {
      const pending: PendingResponse = {
        resolve,
        reject
      };
      context.pending.set(requestId, pending);

      const onAbort = () => {
        context.pending.delete(requestId);
        reject(new CodexAppServerTransportError('provider_error', 'Codex App Server request aborted.'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });

    try {
      context.child.stdin.write(`${JSON.stringify(payload)}\n`);
    } catch (error) {
      context.pending.delete(requestId);
      this.log('request_write_error', {
        id: requestId,
        method,
        error: sanitizeForLog(error instanceof Error ? error.message : String(error))
      });
      throw new CodexAppServerTransportError(
        'runtime_unavailable',
        `Failed to send Codex App Server request: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return promise;
  }

  private handleMessage(context: ProcessContext, message: unknown): void {
    if (!isRecord(message)) {
      return;
    }

    if ('id' in message && (message as { id?: unknown }).id !== undefined) {
      const id = (message as { id: unknown }).id;
      if (typeof id === 'number') {
        const pending = context.pending.get(id);
        if (!pending) {
          return;
        }

        context.pending.delete(id);
        if ('error' in message) {
          this.log('response_error', {
            id,
            method: 'jsonrpc_error',
            error: sanitizeForLog(
              ((message as { error?: { message?: unknown } }).error?.message as string) ??
                'unknown'
            )
          });
          pending.reject(errorFromJsonRpc(message as unknown as CodexAppServerJsonRpcError));
          return;
        }
        if ('result' in message) {
          this.log('response_ok', { id });
          pending.resolve((message as { result: unknown }).result);
        }
      }
      return;
    }

    const method = asString((message as { method?: unknown }).method);
    if (!method) {
      return;
    }

    const params = (message as { params?: unknown }).params;
    if (!isRecord(params)) {
      return;
    }

    if (method === 'item/completed') {
      const threadId = asString(params.threadId);
      const turnId = asString(params.turnId);
      const item = params.item;
      if (!threadId || !turnId || !isRecord(item)) {
        return;
      }

      const itemType = asString(item.type);
      const text = asString(item.text);
      if (itemType !== 'agentMessage' || !text) {
        return;
      }

      const key = toTurnKey(threadId, turnId);
      const existing = context.turnByKey.get(key) ?? {
        outputText: '',
        completed: false,
        status: 'interrupted' as const
      };
      existing.outputText = `${existing.outputText}${text}`.trim();
      context.turnByKey.set(key, existing);
      return;
    }

    if (method === 'turn/completed') {
      const threadId = asString(params.threadId);
      const turn = params.turn;
      if (!threadId || !isRecord(turn)) {
        return;
      }

      const turnId = asString(turn.id);
      const status = asString(turn.status);
      if (!turnId || !status) {
        return;
      }

      const normalizedStatus: CodexAppServerTurnCompletion['turnStatus'] =
        status === 'completed' || status === 'failed' || status === 'interrupted'
          ? status
          : 'failed';

      const key = toTurnKey(threadId, turnId);
      const existing = context.turnByKey.get(key) ?? {
        outputText: '',
        completed: false,
        status: normalizedStatus
      };
      existing.completed = true;
      existing.status = normalizedStatus;

      const errorMessage = isRecord(turn.error) ? asString(turn.error.message) : null;
      existing.errorMessage = errorMessage;
      context.turnByKey.set(key, existing);

      const waiter = context.waiterByKey.get(key);
      if (waiter) {
        context.waiterByKey.delete(key);
        waiter({
          turnStatus: existing.status,
          outputText: existing.outputText || null,
          errorMessage: existing.errorMessage ?? null
        });
      }
    }
  }

  private shutdown(context: ProcessContext): void {
    try {
      context.child.stdin.end();
    } catch {
      // ignore
    }
    if (!context.child.killed) {
      try {
        context.child.kill();
      } catch {
        // ignore
      }
    }
  }

  private log(event: string, details: Record<string, unknown>): void {
    if (!this.logPath) {
      return;
    }

    try {
      appendFileSync(
        this.logPath,
        `${JSON.stringify({ ts: new Date().toISOString(), scope: 'codex_appserver', event, ...details })}\n`,
        'utf8'
      );
    } catch {
      // Logging is best-effort and must never break runtime flow.
    }
  }
}
