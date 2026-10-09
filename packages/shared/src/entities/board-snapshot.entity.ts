import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Index('IDX_board_snapshots_room_created', ['roomId', 'createdAt'])
@Entity('board_snapshots')
export class BoardSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  roomId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lessonId: string | null;

  @Column({ type: 'int', default: 1 })
  formatVersion: number;

  // bytea：运行时由 TypeORM 映射为 Buffer；包内无 node 类型，声明为 Uint8Array（Buffer 是其子类）
  @Column({ type: 'bytea' })
  data: Uint8Array;

  // 冗余字段：列表页只取元信息，避免拖出 bytea 大字段
  @Column({ type: 'int', default: 0 })
  size: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
