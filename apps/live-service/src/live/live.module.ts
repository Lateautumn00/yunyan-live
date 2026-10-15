import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BoardSnapshot,
  CheckinRecord,
  CheckinSession,
  Courseware,
  LiveParticipant,
  LiveRoom,
  LiveTransferCode,
  UserWatchTime,
  VideoRecording
} from '@yunyan-live/shared';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { CheckinService } from './checkin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LiveRoom,
      LiveParticipant,
      LiveTransferCode,
      VideoRecording,
      UserWatchTime,
      Courseware,
      BoardSnapshot,
      CheckinSession,
      CheckinRecord
    ])
  ],
  controllers: [LiveController],
  providers: [LiveService, CheckinService],
  exports: [LiveService, CheckinService]
})
export class LiveModule {}
