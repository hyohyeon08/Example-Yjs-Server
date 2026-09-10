import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'tbl_whiteboard_yjs_updates' })
@Unique('UQ_whiteboard_yjs_updates_sequence', [
  'whiteboardId',
  'updateSequence',
])
export class WhiteboardYjsUpdate {
  @PrimaryGeneratedColumn('uuid')
  updateId!: string;

  @Column({ type: 'uuid' })
  whiteboardId!: string;

  @Column({ type: 'bytea' })
  updateBytes!: Buffer;

  @Column({ type: 'bigint' })
  updateSequence!: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  saveAt!: Date;
}
