import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { GatewayClientsModule } from '../gateway/clients.module';

@Module({
  imports: [GatewayClientsModule],
  controllers: [MailController],
})
export class MailModule {}
