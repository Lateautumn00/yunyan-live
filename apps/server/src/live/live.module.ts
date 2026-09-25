import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { GatewayClientsModule } from '../gateway/clients.module';

@Module({
  imports: [GatewayClientsModule],
  controllers: [LiveController],
})
export class LiveModule {}
