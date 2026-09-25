import { Controller, Post, Body, Inject, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { grpcCall } from '../common/helpers/grpc.helper';
import { SendCodeDto } from './dto/mail.dto';

interface MailServiceClient {
  sendCode(data: { email: string }): Observable<{ code: string; msg: string }>;
}

@Controller('user/mail')
export class MailController implements OnModuleInit {
  constructor(@Inject('MAIL_GRPC') private mailClient: ClientGrpc) {}

  private mailService: MailServiceClient;

  onModuleInit() {
    this.mailService = this.mailClient.getService<MailServiceClient>('MailService');
  }

  @Post('reqEmailCode')
  async sendCode(@Body() dto: SendCodeDto) {
    return grpcCall(this.mailService.sendCode({ email: dto.email }));
  }
}
