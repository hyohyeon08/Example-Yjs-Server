import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'tbl_whiteboard_yjs_snapshot' })
export class WhiteboardYjsSnapshot {
  @PrimaryColumn({ type: 'uuid' })
  whiteboardId!: string;

  @Column({ type: 'bytea' })
  snapshotBytes!: Buffer;

  @Column({ type: 'bigint', default: '0' })
  lastAppliedUpdateSequence!: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  saveAt!: Date;
}
