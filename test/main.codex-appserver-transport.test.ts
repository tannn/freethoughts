import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { describe, expect, it } from 'vitest';
import { CodexCliAppServerTransport } from '../src/main/runtime/codexAppServerTransport.js';
import { CodexAppServerTransportError } from '../src/ai/index.js';

class FakeChildProcess extends EventEmitter {
  readonly stdin = new PassThrough();

  readonly stdout = new PassThrough();

  readonly stderr = new PassThrough();

  killed = false;

  kill(): boolean {
    this.killed = true;
    this.emit('exit', 0, null);
    return true;
  }
}

const setupFakeServer = (
  handler: (message: Record<string, unknown>, child: FakeChildProcess) => void
): FakeChildProcess => {
  const child = new FakeChildProcess();
  createInterface({ input: child.stdin }).on('line', (line) => {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    handler(parsed, child);
  });
  return child;
};

describe('codex app-server stdio transport', () => {
  it('sends initialize/thread/turn requests and resolves completion from notifications', async () => {
    const child = setupFakeServer((message, processRef) => {
      const method = message.method;
      const id = message.id as number;

      if (method === 'initialize') {
        processRef.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result: {} }) + '\n');
        return;
      }
      if (method === 'thread/start') {
        processRef.stdout.write(
          JSON.stringify({ jsonrpc: '2.0', id, result: { thread: { id: 'thread-1' } } }) + '\n'
        );
        return;
      }
      if (method === 'turn/start') {
        processRef.stdout.write(
          JSON.stringify({ jsonrpc: '2.0', id, result: { turn: { id: 'turn-1' } } }) + '\n'
        );
        processRef.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'item/completed',
            params: {
              threadId: 'thread-1',
              turnId: 'turn-1',
              item: {
                id: 'item-1',
                type: 'agentMessage',
                text: 'Generated text'
              }
            }
          }) + '\n'
        );
        processRef.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'turn/completed',
            params: {
              threadId: 'thread-1',
              turn: {
                id: 'turn-1',
                status: 'completed'
              }
            }
          }) + '\n'
        );
      }
    });

    const transport = new CodexCliAppServerTransport({
      spawnImpl: () => child as unknown as ChildProcessWithoutNullStreams
    });

    const signal = new AbortController().signal;
    await transport.initialize({
      params: { clientInfo: { name: 'test', version: '1.0.0' } },
      signal
    });
    const started = await transport.startSession({ params: { model: 'gpt-4.1-mini' }, signal });
    expect(started.threadId).toBe('thread-1');

    const turn = await transport.sendTurn({
      params: {
        threadId: 'thread-1',
        input: [{ type: 'text', text: 'Prompt' }],
        model: 'gpt-4.1-mini'
      },
      signal
    });
    expect(turn.turnId).toBe('turn-1');

    const completion = await transport.waitForTurnCompletion({
      threadId: 'thread-1',
      turnId: 'turn-1',
      signal
    });

    expect(completion).toEqual({
      turnStatus: 'completed',
      outputText: 'Generated text',
      errorMessage: null
    });
  });

  it('maps thread/start permission errors to runtime_inaccessible', async () => {
    const child = setupFakeServer((message, processRef) => {
      const method = message.method;
      const id = message.id as number;
      if (method === 'initialize') {
        processRef.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result: {} }) + '\n');
        return;
      }
      if (method === 'thread/start') {
        processRef.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: 'Codex cannot access session files (permission denied)'
            }
          }) + '\n'
        );
      }
    });

    const transport = new CodexCliAppServerTransport({
      spawnImpl: () => child as unknown as ChildProcessWithoutNullStreams
    });

    const signal = new AbortController().signal;
    await transport.initialize({
      params: { clientInfo: { name: 'test', version: '1.0.0' } },
      signal
    });

    await expect(
      transport.startSession({
        params: { model: 'gpt-4.1-mini' },
        signal
      })
    ).rejects.toMatchObject({
      kind: 'runtime_inaccessible'
    } satisfies Partial<CodexAppServerTransportError>);
  });
});
