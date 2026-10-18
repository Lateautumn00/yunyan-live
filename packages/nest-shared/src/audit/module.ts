import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_PUBLISHER } from './token';
import { createAuditPublisher, type AuditPublisher } from './publisher';

/**
 * S12 审计打点全局供给：RABBITMQ_URL 空 → disabled publisher（恒丢弃+单次告警），
 * 应用不因缺 MQ 配置起不来（与 chat-ws persistence 开关语义对齐）。
 * 类 provider 挂生命周期关闭连接，token 经 useFactory 透出 publisher 本体。
 */
@Injectable()
export class AuditPublisherProvider implements OnModuleDestroy {
  private readonly publisher: AuditPublisher;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('RABBITMQ_URL') || '';
    this.publisher = createAuditPublisher(url || null);
  }

  get handle(): AuditPublisher {
    return this.publisher;
  }

  async onModuleDestroy(): Promise<void> {
    await this.publisher.close();
  }
}

@Global()
@Module({
  providers: [
    AuditPublisherProvider,
    {
      provide: AUDIT_PUBLISHER,
      useFactory: (provider: AuditPublisherProvider) => provider.handle,
      inject: [AuditPublisherProvider]
    }
  ],
  exports: [AUDIT_PUBLISHER]
})
export class AuditModule {}
