import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { resolveSynchronize, SYNC_ENV_KEY } from './db/sync-policy';
import { JanusModule } from './janus/janus.module';
import { LiveModule } from './live/live.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JanusModule,
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        // GAP-S9a：默认 false；生产环境请求 true 直接抛错（见 sync-policy）
        synchronize: resolveSynchronize(config.get(SYNC_ENV_KEY) === 'true'),
        entities: [
          LiveRoom,
          LiveParticipant,
          LiveTransferCode,
          VideoRecording,
          UserWatchTime,
          Courseware,
          BoardSnapshot,
          CheckinSession,
          CheckinRecord
        ],
        timezone: '+08:00'
      }),
      inject: [ConfigService]
    }),
    LiveModule
  ]
})
export class AppModule {}
