import { Metadata } from '@grpc/grpc-js';

export const USER_ID_KEY = 'user-id';

export function userIdMetadata(userId: string): Metadata {
  const metadata = new Metadata();
  metadata.add(USER_ID_KEY, userId);
  return metadata;
}

export function userIdFromMetadata(metadata: Metadata): string {
  return metadata.get(USER_ID_KEY)?.[0] as string;
}
