import * as Y from 'yjs';
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness';

export interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}

export interface WhiteboardRoomClient {
  readonly readyState: number;
  send(data: Uint8Array): void;
}

export class WhiteboardRoom {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  private readonly clients = new Set<WhiteboardRoomClient>();
  private readonly awarenessOwners = new Map<number, WhiteboardRoomClient>();
  private destroyed = false;

  constructor(readonly whiteboardId: string) {
    // 서버 자체는 온라인 참여자로 표시하지 않습니다.
    this.awareness.setLocalState(null);
    this.awareness.on(
      'update',
      (changes: AwarenessChanges, origin: unknown) => {
        if (this.clients.has(origin as WhiteboardRoomClient)) {
          for (const id of [...changes.added, ...changes.updated]) {
            this.awarenessOwners.set(id, origin as WhiteboardRoomClient);
          }
        }
        for (const id of changes.removed) {
          this.awarenessOwners.delete(id);
        }
      },
    );
  }

  addClient(client: WhiteboardRoomClient): void {
    if (this.destroyed) {
      throw new Error('이미 정리된 화이트보드 방에는 입장할 수 없습니다.');
    }

    this.clients.add(client);
  }

  removeClient(client: WhiteboardRoomClient): void {
    this.clients.delete(client);
    const ids = [...this.awarenessOwners]
      .filter(([, owner]) => owner === client)
      .map(([id]) => id);
    removeAwarenessStates(this.awareness, ids, client);
  }

  getClients(): ReadonlyArray<WhiteboardRoomClient> {
    return [...this.clients];
  }

  get clientCount(): number {
    return this.clients.size;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.clients.clear();
    this.awarenessOwners.clear();
    // Awareness도 doc의 destroy 이벤트를 받아 타이머와 상태를 정리합니다.
    this.doc.destroy();
  }
}
