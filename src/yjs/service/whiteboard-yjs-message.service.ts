import { Injectable } from '@nestjs/common';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type {
  AwarenessChanges,
  WhiteboardRoom,
  WhiteboardRoomClient,
} from '../domain/whiteboard-room.js';
import { AppendUpdateService } from './append-update.service.js';
import { BroadcastUpdateService } from './broadcast-update.service.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;

export class InvalidYjsMessageError extends Error {}

@Injectable()
export class WhiteboardYjsMessageService {
  constructor(
    private readonly appendUpdateService: AppendUpdateService,
    private readonly broadcastUpdateService: BroadcastUpdateService,
  ) {}

  initializeRoom(room: WhiteboardRoom): void {
    room.awareness.on('update', (changes: AwarenessChanges) => {
      const ids = [...changes.added, ...changes.updated, ...changes.removed];
      this.broadcastUpdateService.broadcast(
        room,
        this.encodeAwareness(room, ids),
      );
    });
  }

  sendInitialState(room: WhiteboardRoom, client: WhiteboardRoomClient): void {
    const encoder = this.createSyncEncoder();
    syncProtocol.writeSyncStep1(encoder, room.doc);
    client.send(encoding.toUint8Array(encoder));
    client.send(this.encodeAwareness(room));
  }

  async handle(
    room: WhiteboardRoom,
    client: WhiteboardRoomClient,
    bytes: Uint8Array,
  ): Promise<void> {
    let reply: Uint8Array | undefined;
    let update: Uint8Array | undefined;
    let awarenessUpdate: Uint8Array | undefined;

    try {
      const decoder = decoding.createDecoder(bytes);

      switch (decoding.readVarUint(decoder)) {
        case MESSAGE_SYNC: {
          const syncType = decoding.readVarUint(decoder);
          if (syncType === syncProtocol.messageYjsSyncStep1) {
            const encoder = this.createSyncEncoder();
            syncProtocol.readSyncStep1(decoder, encoder, room.doc);
            reply = encoding.toUint8Array(encoder);
          } else if (
            syncType === syncProtocol.messageYjsSyncStep2 ||
            syncType === syncProtocol.messageYjsUpdate
          ) {
            const payload = decoding.readVarUint8Array(decoder);
            const decoded = Y.decodeUpdate(payload);
            if (decoded.structs.length > 0 || decoded.ds.clients.size > 0) {
              update = payload;
            }
          } else {
            throw new Error('Unknown sync message');
          }
          break;
        }
        case MESSAGE_AWARENESS:
          awarenessUpdate = decoding.readVarUint8Array(decoder);
          this.validateAwareness(awarenessUpdate);
          break;
        case MESSAGE_QUERY_AWARENESS:
          reply = this.encodeAwareness(room);
          break;
        default:
          throw new Error('Unknown message');
      }

      if (decoding.hasContent(decoder)) {
        throw new Error('Unexpected trailing bytes');
      }
    } catch {
      throw new InvalidYjsMessageError('잘못된 Yjs 메시지입니다.');
    }

    if (reply !== undefined) {
      client.send(reply);
    } else if (awarenessUpdate !== undefined) {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        awarenessUpdate,
        client,
      );
    } else if (update !== undefined) {
      await this.appendUpdateService.append(
        room.whiteboardId,
        Buffer.from(update),
      );
      Y.applyUpdate(room.doc, update, client);

      const encoder = this.createSyncEncoder();
      syncProtocol.writeUpdate(encoder, update);
      this.broadcastUpdateService.broadcast(
        room,
        encoding.toUint8Array(encoder),
        client,
      );
    }
  }

  private validateAwareness(update: Uint8Array): void {
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    for (let index = 0; index < count; index++) {
      decoding.readVarUint(decoder); // clientID
      decoding.readVarUint(decoder); // clock
      const state: unknown = JSON.parse(decoding.readVarString(decoder));
      if (
        state !== null &&
        (typeof state !== 'object' || Array.isArray(state))
      ) {
        throw new Error('Invalid awareness state');
      }
    }
    if (decoding.hasContent(decoder)) {
      throw new Error('Unexpected awareness bytes');
    }
  }

  private createSyncEncoder(): encoding.Encoder {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    return encoder;
  }

  private encodeAwareness(
    room: WhiteboardRoom,
    ids = [...room.awareness.getStates().keys()],
  ): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, ids),
    );
    return encoding.toUint8Array(encoder);
  }
}
