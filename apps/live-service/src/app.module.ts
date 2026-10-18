import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BoardSnapshot,
  BoardToolUsage,
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
          BoardToolUsage,
          CheckinSession,
          CheckinRecord
        ],
        timezone: '+08:00',
        // F16：列表 SQL 化后的护栏——池上限 + 语句/空闲事务超时（超时报错优于拖垮池）
        poolSize: Number(config.get('DB_POOL_SIZE') || 10),
        extra: {
          statement_timeout: config.get('DB_STATEMENT_TIMEOUT') || '15s',
          idle_in_transaction_session_timeout: config.get('DB_IDLE_TX_TIMEOUT') || '10s'
        }
      }),
      inject: [ConfigService]
    }),
    LiveModule
  ]
})
export class AppModule {}
