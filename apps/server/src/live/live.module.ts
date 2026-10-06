import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { PushController } from './push.controller';
import { GatewayClientsModule } from '../gateway/clients.module';

@Module({
  imports: [GatewayClientsModule],
  controllers: [LiveController, PushController]
})
export class LiveModule {}
