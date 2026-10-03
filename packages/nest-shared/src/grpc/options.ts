import type { Options as ProtoLoaderOptions } from '@grpc/proto-loader';
import { GRPC_LOADER_OPTIONS } from './loader';

export interface GrpcEndpoint {
  package: string;
  protoPath: string;
  loader?: ProtoLoaderOptions;
}

export interface GrpcServerEndpoint extends GrpcEndpoint {
  url: string;
}

export interface GrpcClientEndpoint extends GrpcEndpoint {
  url?: string;
}

export function grpcServerOptions(endpoint: GrpcServerEndpoint) {
  return {
    package: endpoint.package,
    protoPath: endpoint.protoPath,
    url: endpoint.url,
    loader: endpoint.loader ?? GRPC_LOADER_OPTIONS
  };
}

export function grpcClientOptions(endpoint: GrpcClientEndpoint) {
  return {
    package: endpoint.package,
    protoPath: endpoint.protoPath,
    url: endpoint.url,
    loader: endpoint.loader ?? GRPC_LOADER_OPTIONS
  };
}
