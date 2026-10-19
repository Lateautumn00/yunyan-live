import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NOTIFY_PUBLISHER } from './token';
import { createNotifyPublisher, type NotifyPublisher } from './publisher';

/**
 * F9 通知打点全局供给：RABBITMQ_URL 空 → disabled publisher（恒丢弃+单次告警），
 * 应用不因缺 MQ 配置起不来（与 S12 AuditModule 语义对齐）。
 */
@Injectable()
export class NotifyPublisherProvider implements OnModuleDestroy {
  private readonly publisher: NotifyPublisher;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('RABBITMQ_URL') || '';
    this.publisher = createNotifyPublisher(url || null);
  }

  get handle(): NotifyPublisher {
    return this.publisher;
  }

  async onModuleDestroy(): Promise<void> {
    await this.publisher.close();
  }
}

@Global()
@Module({
  providers: [
    NotifyPublisherProvider,
    {
      provide: NOTIFY_PUBLISHER,
      useFactory: (provider: NotifyPublisherProvider) => provider.handle,
      inject: [NotifyPublisherProvider]
    }
  ],
  exports: [NOTIFY_PUBLISHER]
})
export class NotifyModule {}
