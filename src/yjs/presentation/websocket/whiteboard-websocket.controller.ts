import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { WhiteboardRoom } from '../../domain/whiteboard-room.js';
import { WhiteboardRoomService } from '../../service/whiteboard-room.service.js';
import {
  InvalidYjsMessageError,
  WhiteboardYjsMessageService,
} from '../../service/whiteboard-yjs-message.service.js';

const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_PENDING_BYTES = 4 * MAX_MESSAGE_BYTES;
const WHITEBOARD_PATH =
  /^\/whiteboards\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

@Injectable()
export class WhiteboardWebSocketController
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(WhiteboardWebSocketController.name);
  private server?: WebSocketServer;
  private readonly pendingTasks = new Set<Promise<void>>();
  private stopping = false;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly whiteboardRoomService: WhiteboardRoomService,
    private readonly whiteboardYjsMessageService: WhiteboardYjsMessageService,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer() as Server | undefined;

    if (!httpServer) {
      return;
    }

    this.server = new WebSocketServer({
      server: httpServer,
      maxPayload: MAX_MESSAGE_BYTES,
    });
    this.server.on('error', (error) => this.logger.error(error.message));

    this.server.on('connection', (client, request) => {
      this.handleConnection(client, request);
    });
  }

  private handleConnection(client: WebSocket, request: IncomingMessage): void {
    let failed = false;
    client.on('error', (error) => {
      failed = true;
      this.logger.error(error.message);
      client.close(1011, 'Connection failed');
    });

    const whiteboardId = this.getWhiteboardId(request);
    if (whiteboardId === undefined || this.stopping) {
      client.close(1008, 'Invalid room or server stopping');
      return;
    }

    client.on('close', () => {
      failed = true;
      this.whiteboardRoomService.leaveRoom(whiteboardId, client);
      this.logger.log(`퇴장: ${whiteboardId}`);
    });

    let room: WhiteboardRoom | undefined;
    let pendingBytes = 0;
    let pending = this.whiteboardRoomService
      .joinRoom(whiteboardId, client)
      .then((joinedRoom) => {
        if (failed || this.stopping || client.readyState !== WebSocket.OPEN) {
          this.whiteboardRoomService.leaveRoom(whiteboardId, client);
          return;
        }
        room = joinedRoom;
        this.whiteboardYjsMessageService.sendInitialState(room, client);
        this.logger.log(`입장: ${whiteboardId} (${room.clientCount}명)`);
      })
      .catch((error: unknown) => {
        failed = true;
        this.closeForError(client, error);
      });
    this.trackTask(pending);

    client.on('message', (data, isBinary) => {
      if (failed || this.stopping || client.readyState !== WebSocket.OPEN) {
        return;
      }
      if (!isBinary) {
        failed = true;
        client.close(1003, 'Binary messages required');
        return;
      }

      const bytes = this.toBuffer(data);
      if (pendingBytes + bytes.byteLength > MAX_PENDING_BYTES) {
        failed = true;
        client.close(1009, 'Too many pending bytes');
        return;
      }
      pendingBytes += bytes.byteLength;

      pending = pending
        .then(async () => {
          if (!failed && !this.stopping && room) {
            await this.whiteboardYjsMessageService.handle(room, client, bytes);
          }
        })
        .catch((error: unknown) => {
          failed = true;
          this.closeForError(client, error);
        })
        .finally(() => {
          pendingBytes -= bytes.byteLength;
        });
      this.trackTask(pending);
    });
  }

  private getWhiteboardId(request: IncomingMessage): string | undefined {
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      return WHITEBOARD_PATH.exec(pathname)?.[1].toLowerCase();
    } catch {
      return undefined;
    }
  }

  private toBuffer(data: RawData): Buffer {
    if (Array.isArray(data)) {
      return Buffer.concat(data);
    }
    return data instanceof ArrayBuffer ? Buffer.from(data) : data;
  }

  private closeForError(client: WebSocket, error: unknown): void {
    if (error instanceof InvalidYjsMessageError) {
      client.close(1007, 'Invalid Yjs message');
    } else {
      this.logger.error('화이트보드 요청 처리 실패', error);
      client.close(1011, 'Request failed');
    }
  }

  private trackTask(task: Promise<void>): void {
    this.pendingTasks.add(task);
    void task.then(
      () => this.pendingTasks.delete(task),
      () => this.pendingTasks.delete(task),
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    const server = this.server;
    if (!server) {
      return;
    }

    this.server = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      for (const client of server.clients) {
        client.terminate();
      }
    });

    await Promise.allSettled(this.pendingTasks);
  }
}
