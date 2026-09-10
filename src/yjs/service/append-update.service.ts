import { Injectable } from '@nestjs/common';
import { WhiteboardYjsRepository } from '../domain/repository/whiteboard-yjs.repository.js';

@Injectable()
export class AppendUpdateService {
  constructor(private readonly repository: WhiteboardYjsRepository) {}

  async append(whiteboardId: string, updateBuffer: Buffer): Promise<void> {
    await this.repository.appendUpdate(whiteboardId, updateBuffer);
  }
}
