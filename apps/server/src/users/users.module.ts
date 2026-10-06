import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { GatewayClientsModule } from '../gateway/clients.module';

@Module({
  imports: [GatewayClientsModule],
  controllers: [UsersController]
})
export class UsersModule {}
