import * as Y from 'yjs';
/* eslint-disable @typescript-eslint/no-explicit-any */

// F6.3 课后回看：服务端快照是整 doc 的 Y.encodeStateAsUpdate 二进制（base64 传输）。
// 解码为独立 Y.Doc 后只读读取页与元素，供离线查看器渲染（不连 WS、不写回）。
export function decodeBoardSnapshot(base64: string): Y.Doc {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  return doc;
}

export function readSnapshotPages(doc: Y.Doc): Array<{ id: string; elements: Y.Array<any> }> {
  const pages = doc.getArray<Y.Map<any>>('pages');
  return pages.toArray().map(p => ({
    id: String(p.get('id') ?? ''),
    elements: (p.get('elements') as Y.Array<any>) ?? new Y.Array()
  }));
}
