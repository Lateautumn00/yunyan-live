import { describe, expect, it } from 'vitest';
import {
  countNoteChars,
  MAX_NOTE_CHARS,
  noteImageMarkdown,
  noteTitle,
  renderNoteMarkdown,
  UNTITLED_NOTE_TITLE
} from './markdownNote';

describe('markdownNote — 渲染管线', () => {
  it('标准 markdown 渲染为 HTML', () => {
    const html = renderNoteMarkdown('# 标题\n\n**加粗** 与 `代码`');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>加粗</strong>');
    expect(html).toContain('<code>代码</code>');
  });

  it('note-img 引用输出 data-note-img 且不携带 note-img src', () => {
    const html = renderNoteMarkdown('![图片](note-img:abc_123)');
    expect(html).toContain('<img data-note-img="abc_123"');
    expect(html).not.toContain('note-img:');
  });

  it('消毒剥离 script 与事件处理器（html:true 不放行危险内容）', () => {
    const html = renderNoteMarkdown(
      '<script>alert(1)</script><img src="x" onerror="alert(2)">文本'
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).toContain('文本');
  });

  it('外链图片禁用：http(s) 图片不渲染', () => {
    const html = renderNoteMarkdown('![x](https://evil.example/a.png) 文本');
    expect(html).not.toContain('<img');
    expect(html).toContain('文本');
  });

  it('裸 style 标签剥离，span 行内样式保留（颜色通道）', () => {
    expect(renderNoteMarkdown('<style>body{display:none}</style>hi')).not.toContain('<style');
    const colored = renderNoteMarkdown('<span style="color:#f00">红字</span>');
    expect(colored).toContain('<span');
    expect(colored).toContain('color:#f00');
    expect(colored).toContain('红字');
  });

  it('非法 note-img 引用 id 不渲染', () => {
    expect(renderNoteMarkdown('![x](note-img:bad_id_with_underscores_ok)')).toContain(
      'data-note-img="bad_id_with_underscores_ok"'
    );
    expect(renderNoteMarkdown('![x](note-img:has space)')).not.toContain('data-note-img');
  });

  it('noteImageMarkdown 生成与解析一致的引用', () => {
    const md = noteImageMarkdown('x9');
    expect(md).toBe('![图片](note-img:x9)');
    const html = renderNoteMarkdown(md);
    expect(html).toContain('data-note-img="x9"');
  });
});

describe('markdownNote — 标题与字数', () => {
  it('noteTitle 取首个非空有效行并去 md 标记', () => {
    expect(noteTitle('# 今日要点\n正文')).toBe('今日要点');
    expect(noteTitle('**加粗标题**\n正文')).toBe('加粗标题');
    expect(noteTitle('[链接文本](https://a.example)\nx')).toBe('链接文本');
  });

  it('noteTitle 首行为图片时顺延到下一行', () => {
    expect(noteTitle('![图片](note-img:a)\n第二行内容')).toBe('第二行内容');
  });

  it('noteTitle 超 30 字截断加省略号', () => {
    const long = 'x'.repeat(40);
    expect(noteTitle(long)).toBe(`${'x'.repeat(30)}…`);
  });

  it('noteTitle 全空回退未命名', () => {
    expect(noteTitle('')).toBe(UNTITLED_NOTE_TITLE);
    expect(noteTitle('   \n\n![图片](note-img:a)')).toBe(UNTITLED_NOTE_TITLE);
  });

  it('countNoteChars 剥离图片引用计数并以 2 万为上限', () => {
    expect(countNoteChars('abc![i](note-img:1)def')).toBe(6);
    expect(MAX_NOTE_CHARS).toBe(20000);
  });
});
