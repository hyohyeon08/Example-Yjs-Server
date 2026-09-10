import { Module } from '@nestjs/common';
import { DatabaseModule } from './global/module/database.module.js';
import { WhiteboardYjsModule } from './yjs/whiteboard-yjs.module.js';

@Module({
  imports: [DatabaseModule, WhiteboardYjsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
