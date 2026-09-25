import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'mail',
        protoPath: join(__dirname, '../proto/mail.proto'),
        url: `0.0.0.0:${process.env.GRPC_PORT || 50053}`,
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        },
      },
    },
  );

  await app.listen();
  console.log(`Mail service gRPC listening on port ${process.env.GRPC_PORT || 50053}`);
}
bootstrap();
