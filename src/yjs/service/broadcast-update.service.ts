import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import type {
  WhiteboardRoom,
  WhiteboardRoomClient,
} from '../domain/whiteboard-room.js';

@Injectable()
export class BroadcastUpdateService {
  private readonly logger = new Logger(BroadcastUpdateService.name);

  broadcast(
    room: WhiteboardRoom,
    message: Uint8Array,
    excludedClient?: WhiteboardRoomClient,
  ): void {
    for (const client of room.getClients()) {
      if (client === excludedClient || client.readyState !== WebSocket.OPEN) {
        continue;
      }
      try {
        client.send(message);
      } catch (error) {
        this.logger.error('WebSocket 전송 실패', error);
      }
    }
  }
}
