import { Module, Global } from '@nestjs/common';
import { JanusService } from './janus.service';

@Global()
@Module({
  providers: [JanusService],
  exports: [JanusService],
})
export class JanusModule {}
