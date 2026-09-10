import { Injectable } from '@nestjs/common';
import { DataSource, LessThanOrEqual, MoreThan } from 'typeorm';
import { WhiteboardYjsSnapshot } from '../whiteboard-yjs-snapshot.js';
import { WhiteboardYjsState } from '../whiteboard-yjs-state.js';
import { WhiteboardYjsUpdate } from '../whiteboard-yjs-update.js';

@Injectable()
export class WhiteboardYjsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async selectSnapshotAndUpdates(whiteboardId: string): Promise<{
    snapshot: WhiteboardYjsSnapshot | null;
    updates: WhiteboardYjsUpdate[];
  }> {
    // 조회 도중 Worker가 스냅샷을 교체하고 로그를 삭제해도 같은 시점을 읽습니다.
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const snapshot = await manager
        .getRepository(WhiteboardYjsSnapshot)
        .findOneBy({ whiteboardId });

      const updates = await manager.getRepository(WhiteboardYjsUpdate).find({
        where: {
          whiteboardId,
          updateSequence: MoreThan(snapshot?.lastAppliedUpdateSequence ?? '0'),
        },
        order: { updateSequence: 'ASC' },
      });

      return { snapshot, updates };
    });
  }

  async upsertSnapshotAndDeleteUpdates(
    whiteboardId: string,
    snapshotBytes: Buffer,
    lastAppliedUpdateSequence: string,
  ): Promise<boolean> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // appendUpdate와 같은 고정 행을 잠급니다. 스냅샷 계산은 이미 끝난 상태입니다.
      const state = await manager
        .getRepository(WhiteboardYjsState)
        .findOneOrFail({
          where: { whiteboardId },
          lock: { mode: 'pessimistic_write' },
        });
      const snapshotRepository = manager.getRepository(WhiteboardYjsSnapshot);
      const current = await snapshotRepository.findOneBy({ whiteboardId });
      const cutoff = BigInt(lastAppliedUpdateSequence);

      // 다른 Worker가 더 최신 스냅샷을 먼저 저장했다면 덮어쓰지 않습니다.
      if (BigInt(current?.lastAppliedUpdateSequence ?? '0') >= cutoff) {
        return false;
      }
      if (cutoff > BigInt(state.lastStoredUpdateSequence)) {
        throw new Error(
          '저장된 업데이트 순번보다 앞선 스냅샷은 저장할 수 없습니다.',
        );
      }

      await snapshotRepository.upsert(
        {
          whiteboardId,
          snapshotBytes,
          lastAppliedUpdateSequence,
          saveAt: new Date(),
        },
        ['whiteboardId'],
      );
      await manager.getRepository(WhiteboardYjsUpdate).delete({
        whiteboardId,
        updateSequence: LessThanOrEqual(lastAppliedUpdateSequence),
      });

      return true;
    });
  }

  async selectWhiteboardIdsForSnapshot(
    minimumUpdateCount: number,
    olderThan: Date,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.dataSource
      .getRepository(WhiteboardYjsUpdate)
      .createQueryBuilder('update')
      .select('update.whiteboardId', 'whiteboardId')
      .groupBy('update.whiteboardId')
      .having(
        'COUNT(*) >= :minimumUpdateCount OR MIN(update.saveAt) <= :olderThan',
        {
          minimumUpdateCount,
          olderThan,
        },
      )
      .orderBy('MIN(update.saveAt)', 'ASC')
      .addOrderBy('update.whiteboardId', 'ASC')
      .limit(limit)
      .getRawMany<{ whiteboardId: string }>();

    return rows.map((row) => row.whiteboardId);
  }

  public async appendUpdate(
    whiteboardId: string,
    updateBuffer: Buffer,
  ): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const stateRepository = manager.getRepository(WhiteboardYjsState);
      const updateRepository = manager.getRepository(WhiteboardYjsUpdate);

      await stateRepository
        .createQueryBuilder()
        .insert()
        .values({ whiteboardId })
        .orIgnore()
        .execute();

      const state = await stateRepository.findOneOrFail({
        where: { whiteboardId },
        lock: { mode: 'pessimistic_write' },
      });

      const nextSequence = (
        BigInt(state.lastStoredUpdateSequence) + 1n
      ).toString();

      await stateRepository.update(
        { whiteboardId },
        { lastStoredUpdateSequence: nextSequence },
      );
      await updateRepository.insert({
        whiteboardId,
        updateBytes: updateBuffer,
        updateSequence: nextSequence,
      });
    });
  }
}
