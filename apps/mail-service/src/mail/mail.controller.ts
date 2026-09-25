import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod, EventPattern } from '@nestjs/microservices';
import { MailService } from './mail.service';

@Controller()
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(private readonly mailService: MailService) {}

  @GrpcMethod('MailService', 'SendCode')
  async sendCode(data: { email: string }) {
    this.logger.log(`gRPC SendCode: ${data.email}`);
    await this.mailService.sendCode(data.email);
    return { code: '0', msg: 'success' };
  }

  @GrpcMethod('MailService', 'VerifyCode')
  async verifyCode(data: { email: string; code: string }) {
    this.logger.log(`gRPC VerifyCode: ${data.email}`);
    const valid = await this.mailService.verifyCode(data.email, data.code);
    return {
      code: valid ? '0' : '1',
      msg: valid ? 'success' : '验证码无效或已过期',
      valid,
    };
  }

  @EventPattern('mail.send_code')
  async handleSendCode(data: { email: string }) {
    this.logger.log(`MQ handleSendCode: ${data.email}`);
    await this.mailService.sendCode(data.email);
  }
}
