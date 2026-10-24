import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin, User } from '@yunyan-live/shared';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminsService } from './admins.service';
import { UsersAdminService } from '../users-admin/users-admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([Admin, User])],
  controllers: [AdminController],
  providers: [AdminService, AdminsService, UsersAdminService]
})
export class AdminModule {}
