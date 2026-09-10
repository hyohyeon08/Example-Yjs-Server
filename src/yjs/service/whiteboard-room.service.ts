import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import * as Y from 'yjs';
import { WhiteboardYjsRepository } from '../domain/repository/whiteboard-yjs.repository.js';
import {
  WhiteboardRoom,
  type WhiteboardRoomClient,
} from '../domain/whiteboard-room.js';
import { WhiteboardYjsMessageService } from './whiteboard-yjs-message.service.js';

@Injectable()
export class WhiteboardRoomService implements BeforeApplicationShutdown {
  private readonly rooms = new Map<string, WhiteboardRoom>();
  private readonly loadingRooms = new Map<string, Promise<WhiteboardRoom>>();
  private shuttingDown = false;

  constructor(
    private readonly whiteboardYjsRepository: WhiteboardYjsRepository,
    private readonly whiteboardYjsMessageService: WhiteboardYjsMessageService,
  ) {}

  getRoom(whiteboardId: string): WhiteboardRoom | undefined {
    return this.rooms.get(whiteboardId);
  }

  async joinRoom(
    whiteboardId: string,
    client: WhiteboardRoomClient,
  ): Promise<WhiteboardRoom> {
    this.assertRunning();
    const room = await this.getOrLoadRoom(whiteboardId);
    this.assertRunning();
    room.addClient(client);
    return room;
  }

  leaveRoom(whiteboardId: string, client: WhiteboardRoomClient): void {
    this.rooms.get(whiteboardId)?.removeClient(client);
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.allSettled(this.loadingRooms.values());

    for (const room of this.rooms.values()) {
      room.destroy();
    }

    this.rooms.clear();
  }

  private getOrLoadRoom(whiteboardId: string): Promise<WhiteboardRoom> {
    const room = this.rooms.get(whiteboardId);
    if (room) {
      return Promise.resolve(room);
    }

    const loadingRoom = this.loadingRooms.get(whiteboardId);
    if (loadingRoom) {
      return loadingRoom;
    }

    const loading = this.loadRoom(whiteboardId).finally(() => {
      this.loadingRooms.delete(whiteboardId);
    });

    this.loadingRooms.set(whiteboardId, loading);
    return loading;
  }

  private async loadRoom(whiteboardId: string): Promise<WhiteboardRoom> {
    const { snapshot, updates } =
      await this.whiteboardYjsRepository.selectSnapshotAndUpdates(whiteboardId);

    this.assertRunning();
    const room = new WhiteboardRoom(whiteboardId);

    try {
      if (snapshot !== null) {
        Y.applyUpdate(room.doc, snapshot.snapshotBytes);
      }

      for (const update of updates) {
        Y.applyUpdate(room.doc, update.updateBytes);
      }

      this.whiteboardYjsMessageService.initializeRoom(room);
      this.rooms.set(whiteboardId, room);
      return room;
    } catch (error) {
      room.destroy();
      throw error;
    }
  }

  private assertRunning(): void {
    if (this.shuttingDown) {
      throw new Error('애플리케이션 종료 중에는 방에 입장할 수 없습니다.');
    }
  }
}
