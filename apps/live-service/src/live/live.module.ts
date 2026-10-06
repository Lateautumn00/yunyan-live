import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Courseware,
  LiveParticipant,
  LiveRoom,
  LiveTransferCode,
  UserWatchTime,
  VideoRecording
} from '@yunyan-live/shared';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LiveRoom,
      LiveParticipant,
      LiveTransferCode,
      VideoRecording,
      UserWatchTime,
      Courseware
    ])
  ],
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService]
})
export class LiveModule {}
