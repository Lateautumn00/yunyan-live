import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Index('idx_board_tool_usage_room_created', ['roomId', 'createdAt'])
@Entity('board_tool_usage')
export class BoardToolUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  roomId: string;

  @Column({ length: 50 })
  userId: string;

  @Column({ length: 40 })
  tool: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
