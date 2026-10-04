import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('video_recordings')
export class VideoRecording {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  roomId: string;

  @Column({ length: 500 })
  filePath: string;

  @Column({ length: 200 })
  fileName: string;

  @Column({ type: 'bigint', default: 0 })
  fileSize: number;

  @Column({ type: 'int', default: 0 })
  duration: number;

  @Column({ type: 'int', default: 1 })
  recordType: number; // 1=本地窗口录制, 2=Janus服务端录制

  @Column({ length: 50, default: '' })
  teacherName: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
