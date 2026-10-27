import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin, User } from '@yunyan-live/shared';
import { AdminHttpModule } from './http/admin-http.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [Admin, User],
        synchronize: false
      }),
      inject: [ConfigService]
    }),
    AdminHttpModule
  ]
})
export class AppModule {}
