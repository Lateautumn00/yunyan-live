import MarkdownIt, { type MarkdownItOptions, type RendererRule } from 'markdown-it';
import DOMPurify from 'dompurify';

/** 便签 Markdown 管线：markdown-it 渲染 → 自定义图片规则（note-img 引用）→ DOMPurify 消毒 */

export const NOTE_IMG_PREFIX = 'note-img:';
export const MAX_NOTE_CHARS = 20000;
export const UNTITLED_NOTE_TITLE = '未命名便签';

const md = new MarkdownIt({ html: true, linkify: false } satisfies MarkdownItOptions);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 图片规则：note-img 引用输出 data-note-img（src 留待挂载后换 blob），外链图片禁用 */
const imageRule: RendererRule = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (!token) return '';
  const src = String(token.attrGet('src') ?? '');
  const alt = token.children ? self.renderInlineAsText(token.children, options, env) : '';
  if (src.startsWith(NOTE_IMG_PREFIX)) {
    const id = src.slice(NOTE_IMG_PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return '';
    return `<img data-note-img="${id}" alt="${escapeHtml(alt)}">`;
  }
  if (src.startsWith('data:image/')) {
    return `<img src="${src}" alt="${escapeHtml(alt)}">`;
  }
  return '';
};

md.renderer.rules.image = imageRule;

/** 渲染便签 Markdown 为消毒后的 HTML（图片以 data-note-img 标记，src 由挂载层注入） */
export function renderNoteMarkdown(content: string): string {
  return DOMPurify.sanitize(md.render(content), { FORBID_TAGS: ['style'] });
}

/** 便签图片插入用的 Markdown（编辑器插图与存储引用一致） */
export function noteImageMarkdown(id: string): string {
  return `![图片](${NOTE_IMG_PREFIX}${id})`;
}

const IMAGE_MD_RE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK_MD_RE = /\[([^\]]*)\]\([^)]*\)/g;

function stripInlineMarkdown(line: string): string {
  return line
    .replace(IMAGE_MD_RE, '')
    .replace(LINK_MD_RE, '$1')
    .replace(/^#{1,6}\s+/, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .trim();
}

/** 首行自动标题：取首个非空有效行，去图片/标题标记/链接/强调符，超长截断 */
export function noteTitle(content: string, max = 30): string {
  for (const raw of content.split(/\r?\n/)) {
    const plain = stripInlineMarkdown(raw.trim());
    if (!plain) continue;
    return plain.length > max ? `${plain.slice(0, max)}…` : plain;
  }
  return UNTITLED_NOTE_TITLE;
}

/** 字数统计：剥离图片引用后计数（单条上限 MAX_NOTE_CHARS） */
export function countNoteChars(content: string): number {
  return content.replace(IMAGE_MD_RE, '').length;
}
