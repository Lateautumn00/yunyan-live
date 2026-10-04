export const PROTOCOL_SCHEME = 'atom';

export function isHttpUrl(url: string): boolean {
  return url.startsWith('http:') || url.startsWith('https:');
}
