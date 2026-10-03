import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod, EventPattern } from '@nestjs/microservices';
import { fail, ok } from '@yunyan-live/nest-shared';
import { MailService } from './mail.service';

@Controller()
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(private readonly mailService: MailService) {}

  @GrpcMethod('MailService', 'SendCode')
  async sendCode(data: { email: string }) {
    this.logger.log(`gRPC SendCode: ${data.email}`);
    await this.mailService.sendCode(data.email);
    return ok();
  }

  @GrpcMethod('MailService', 'VerifyCode')
  async verifyCode(data: { email: string; code: string }) {
    this.logger.log(`gRPC VerifyCode: ${data.email}`);
    const valid = await this.mailService.verifyCode(data.email, data.code);
    return valid ? ok({ valid }) : fail('验证码无效或已过期', { valid });
  }

  @EventPattern('mail.send_code')
  async handleSendCode(data: { email: string }) {
    this.logger.log(`MQ handleSendCode: ${data.email}`);
    await this.mailService.sendCode(data.email);
  }
}
