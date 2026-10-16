// jszip 自带 d.ts 含 `/// <reference types="node" />`，会把 Node 全局类型带进渲染端
// 编译单元（DOM/Node 定时器类型冲突）。此处以最小类型面替代（tsconfig paths 指向本文件，
// 运行时仍解析 node_modules 中的真包），仅声明 F6.1 导出与便签导出导入用到的 API。

export interface JSZipObject {
  name: string;
  dir: boolean;
  async(type: 'string'): Promise<string>;
  async(type: 'blob'): Promise<Blob>;
}

export default class JSZip {
  static loadAsync(data: ArrayBuffer): Promise<JSZip>;
  file(name: string, data: string | Blob, options?: { base64?: boolean }): this;
  file(name: string): JSZipObject | null;
  generateAsync(options: { type: 'arraybuffer' }): Promise<ArrayBuffer>;
  files: Record<string, JSZipObject>;
}
