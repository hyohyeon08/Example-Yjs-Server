import { Injectable } from '@nestjs/common';
import * as Y from 'yjs';
import { WhiteboardYjsRepository } from '../domain/repository/whiteboard-yjs.repository.js';

@Injectable()
export class CreateSnapshotService {
  constructor(private readonly repository: WhiteboardYjsRepository) {}

  async createSnapshot(whiteboardId: string): Promise<boolean> {
    const { snapshot, updates } = await this.repository.selectSnapshotAndUpdates(whiteboardId);
    const latest = updates.at(-1);
    if (!latest) {
      return false;
    }

    const doc = new Y.Doc();
    try {
      if (snapshot) {
        Y.applyUpdate(doc, snapshot.snapshotBytes);
      }
      for (const update of updates) {
        Y.applyUpdate(doc, update.updateBytes);
      }

      const snapshotBytes = Buffer.from(Y.encodeStateAsUpdate(doc));
      return await this.repository.upsertSnapshotAndDeleteUpdates(
        whiteboardId,
        snapshotBytes,
        latest.updateSequence,
      );
    } finally {
      doc.destroy();
    }
  }
}
