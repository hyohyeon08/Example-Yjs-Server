import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { WhiteboardYjsRepository } from '../../domain/repository/whiteboard-yjs.repository.js';
import { CreateSnapshotService } from '../create-snapshot.service.js';

const CHECK_INTERVAL_MS = 5_000;
const MINIMUM_UPDATE_COUNT = 100;
const MAXIMUM_UPDATE_AGE_MS = 60_000;
const BATCH_SIZE = 20;

@Injectable()
export class CreateSnapshotWorker implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CreateSnapshotWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly repository: WhiteboardYjsRepository,
    private readonly createSnapshotService: CreateSnapshotService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.runOnce(), CHECK_INTERVAL_MS);
    this.timer.unref();
    void this.runOnce();
  }

  runOnce(): Promise<void> {
    if (this.stopping) {
      return Promise.resolve();
    }
    if (this.running) {
      return this.running;
    }

    this.running = this.createSnapshots()
      .catch((error: unknown) =>
        this.logger.error('스냅샷 대상 조회 실패', error),
      )
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async createSnapshots(): Promise<void> {
    const whiteboardIds = await this.repository.selectWhiteboardIdsForSnapshot(
      MINIMUM_UPDATE_COUNT,
      new Date(Date.now() - MAXIMUM_UPDATE_AGE_MS),
      BATCH_SIZE,
    );

    for (const whiteboardId of whiteboardIds) {
      if (this.stopping) {
        break;
      }
      try {
        const created =
          await this.createSnapshotService.createSnapshot(whiteboardId);
        if (created) {
          this.logger.log(`스냅샷 생성 완료: ${whiteboardId}`);
        }
      } catch (error) {
        this.logger.error(`스냅샷 생성 실패: ${whiteboardId}`, error);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.running;
  }
}
