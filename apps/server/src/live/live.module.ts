import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { PushController } from './push.controller';
import { CheckinController } from './checkin.controller';
import { GatewayClientsModule } from '../gateway/clients.module';

@Module({
  imports: [GatewayClientsModule],
  controllers: [LiveController, PushController, CheckinController]
})
export class LiveModule {}
