import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferencePicker } from '../src/ReferencePicker.js';

test('引用多选保留，模板入口仅提供给支持的 Word 和 Markdown，按钮不嵌套', () => {
  const files = ['模板.docx', '标准.MD', '章节.markdown', '访谈.pdf', '界面.html'].map(path => ({ mountId: 'refs', path, size: 10 }));
  const html = renderToStaticMarkup(createElement(ReferencePicker, {
    open: true, files, mounts: [{ id: 'refs', name: '参考资料' }],
    selected: [files[3], files[4]], template: files[0], onClose() {}, onConfirm() {},
  }));
  assert.equal((html.match(/type="checkbox"/g) || []).length, 5);
  assert.equal((html.match(/checked=""/g) || []).length, 2);
  assert.equal((html.match(/aria-pressed=/g) || []).length, 3);
  assert.match(html, /取消 PRD 模板 模板.docx/);
  assert.match(html, /用作 PRD 模板 标准.MD/);
  assert.match(html, /用作 PRD 模板 章节.markdown/);
  assert.doesNotMatch(html, /用作 PRD 模板 (访谈.pdf|界面.html)/);
  assert.match(html, /已选 2 份参考 · 1 份 PRD 模板/);
  assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
});

test('只选模板不伪装成普通引用，关闭的选择器不渲染', () => {
  const template = { mountId: 'refs', path: 'PRD.docx', size: 10 };
  const props = { open: true, files: [template], mounts: [], selected: [], template, onClose() {}, onConfirm() {} };
  const html = renderToStaticMarkup(createElement(ReferencePicker, props));
  assert.match(html, /未选择参考 · 1 份 PRD 模板/);
  assert.doesNotMatch(html, /checked=""/);
  assert.equal(renderToStaticMarkup(createElement(ReferencePicker, { ...props, open: false })), '');
});
