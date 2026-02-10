import { IPC_CHANNELS, type IpcChannel } from '../../shared/ipc/channels.js';
import { ok, type IpcEnvelope } from '../../shared/ipc/envelope.js';
import { toErrorEnvelope, validationErrorFromZod } from '../../shared/ipc/errors.js';
import { IPC_SCHEMA_BY_CHANNEL } from '../../shared/ipc/schemas.js';

export type IpcMainListener = (event: unknown, payload: unknown) => Promise<IpcEnvelope>;

export interface IpcMainLike {
  handle(channel: string, listener: IpcMainListener): void;
}

export type IpcBusinessHandler = (payload: unknown) => Promise<unknown> | unknown;

export type IpcBusinessHandlers = Record<IpcChannel, IpcBusinessHandler>;

const notImplementedHandler = (): never => {
  throw new Error('Handler not implemented');
};

export const createDefaultBusinessHandlers = (): IpcBusinessHandlers => {
  return IPC_CHANNELS.reduce((acc, channel) => {
    acc[channel] = notImplementedHandler;
    return acc;
  }, {} as IpcBusinessHandlers);
};

export const registerValidatedIpcHandlers = (
  ipcMain: IpcMainLike,
  handlers: IpcBusinessHandlers
): void => {
  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, async (_event, payload) => {
      const schema = IPC_SCHEMA_BY_CHANNEL[channel];
      const validation = schema.safeParse(payload);
      if (!validation.success) {
        return validationErrorFromZod(validation.error);
      }

      try {
        const data = await handlers[channel](validation.data);
        return ok(data);
      } catch (cause) {
        return toErrorEnvelope(cause);
      }
    });
  }
};
