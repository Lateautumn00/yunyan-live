import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Admin, User } from '@yunyan-live/shared';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminsService } from './admins.service';
import { UsersAdminService } from '../users-admin/users-admin.service';
import { LiveAdminService } from '../live-admin/live-admin.service';
import { DashboardAdminService } from '../dashboard-admin/dashboard-admin.service';
import { AuditAdminService } from '../audit-admin/audit-admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([Admin, User])],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminsService,
    UsersAdminService,
    LiveAdminService,
    DashboardAdminService,
    AuditAdminService
  ]
})
export class AdminModule {}
