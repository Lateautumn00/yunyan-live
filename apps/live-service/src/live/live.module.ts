import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { LiveRoom } from './live-room.entity';
import { LiveParticipant } from './live-participant.entity';
import { LiveTransferCode } from './live-transfer-code.entity';
import { VideoRecording } from './video-recording.entity';
import { UserWatchTime } from './user-watch-time.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([LiveRoom, LiveParticipant, LiveTransferCode, VideoRecording, UserWatchTime]),
  ],
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}
