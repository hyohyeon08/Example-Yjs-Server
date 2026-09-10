import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhiteboardYjsRepository } from './domain/repository/whiteboard-yjs.repository.js';
import { WhiteboardYjsSnapshot } from './domain/whiteboard-yjs-snapshot.js';
import { WhiteboardYjsState } from './domain/whiteboard-yjs-state.js';
import { WhiteboardYjsUpdate } from './domain/whiteboard-yjs-update.js';
import { WhiteboardWebSocketController } from './presentation/websocket/whiteboard-websocket.controller.js';
import { AppendUpdateService } from './service/append-update.service.js';
import { WhiteboardRoomService } from './service/whiteboard-room.service.js';
import { BroadcastUpdateService } from './service/broadcast-update.service.js';
import { WhiteboardYjsMessageService } from './service/whiteboard-yjs-message.service.js';
import { CreateSnapshotService } from './service/create-snapshot.service.js';
import { CreateSnapshotWorker } from './service/worker/create-snapshot.worker.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhiteboardYjsSnapshot,
      WhiteboardYjsState,
      WhiteboardYjsUpdate,
    ]),
  ],
  providers: [
    WhiteboardYjsRepository,
    AppendUpdateService,
    BroadcastUpdateService,
    WhiteboardYjsMessageService,
    WhiteboardRoomService,
    WhiteboardWebSocketController,
    CreateSnapshotService,
    CreateSnapshotWorker,
  ],
  exports: [AppendUpdateService, WhiteboardRoomService, CreateSnapshotService],
})
export class WhiteboardYjsModule {}
