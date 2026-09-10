import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'tbl_whiteboard_yjs_state' })
export class WhiteboardYjsState {
  @PrimaryColumn({ type: 'uuid' })
  whiteboardId!: string;

  @Column({ type: 'bigint', default: '0' })
  lastStoredUpdateSequence!: string;
}
