import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BoardSnapshot,
  Courseware,
  LiveParticipant,
  LiveRoom,
  LiveTransferCode,
  UserWatchTime,
  VideoRecording
} from '@yunyan-live/shared';
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
        entities: [
          LiveRoom,
          LiveParticipant,
          LiveTransferCode,
          VideoRecording,
          UserWatchTime,
          Courseware,
          BoardSnapshot
        ],
        synchronize: true,
        timezone: '+08:00'
      }),
      inject: [ConfigService]
    }),
    LiveModule
  ]
})
export class AppModule {}
