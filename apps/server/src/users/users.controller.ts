import { Controller, Get } from '@nestjs/common';

@Controller('user/user')
export class UsersController {
  @Get('getNowTime')
  getNowTime() {
    return { nowTime: Date.now().toString() };
  }
}
