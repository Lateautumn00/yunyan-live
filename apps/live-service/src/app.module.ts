import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JanusModule } from './janus/janus.module';
import { LiveModule } from './live/live.module';
import { LiveRoom } from './live/live-room.entity';
import { LiveParticipant } from './live/live-participant.entity';
import { LiveTransferCode } from './live/live-transfer-code.entity';
import { UserWatchTime } from './live/user-watch-time.entity';
import { VideoRecording } from './live/video-recording.entity';
import { Courseware } from './live/courseware.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JanusModule,
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [LiveRoom, LiveParticipant, LiveTransferCode, VideoRecording, UserWatchTime, Courseware],
        synchronize: true,
        timezone: '+08:00',
      }),
      inject: [ConfigService],
    }),
    LiveModule,
  ],
})
export class AppModule {}
