import type { Options as ProtoLoaderOptions } from '@grpc/proto-loader';

export const GRPC_LOADER_OPTIONS: ProtoLoaderOptions = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
};
