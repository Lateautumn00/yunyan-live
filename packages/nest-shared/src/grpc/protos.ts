import { join } from 'path';

const PROTO_DIR = join(__dirname, '..', '..', 'src', 'protos');

export function resolveProto(name: string): string {
  return join(PROTO_DIR, name);
}
