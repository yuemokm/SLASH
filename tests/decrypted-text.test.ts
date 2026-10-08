import { test } from "node:test";
import assert from "node:assert/strict";
import { markNewMarkdownText, MAX_DECRYPTED_CHARACTERS } from "../src/decrypted-text.ts";

test("只标记流式新增文本，代码块保持原样并限制长度", () => {
  const source = "已完成\n\n```ts\nconst value = 1;\n```\n新增的一段正文";
  const tree = {
    type: "root",
    children: [
      { type: "element", tagName: "p", children: [{ type: "text", value: "已完成", position: { start: { offset: 0 } } }] },
      { type: "element", tagName: "pre", children: [{ type: "text", value: "const value = 1;", position: { start: { offset: 13 } } }] },
      { type: "element", tagName: "p", children: [{ type: "text", value: "新增的一段正文", position: { start: { offset: source.indexOf("新增") } } }] },
    ],
  };
  markNewMarkdownText(tree, source, source.indexOf("新增"));
  const paragraph = tree.children[2] as { children: Array<Record<string, unknown>> };
  assert.equal(paragraph.children[0].type, "element");
  assert.equal((paragraph.children[0].properties as Record<string, unknown>)["data-decrypt-key"], String(source.indexOf("新增")));
  const code = tree.children[1] as { children: Array<Record<string, unknown>> };
  assert.equal(code.children[0].type, "text");
});

test("新增标记不会超过 24 个字符", () => {
  const value = "a".repeat(MAX_DECRYPTED_CHARACTERS + 10);
  const tree = { type: "root", children: [{ type: "text", value, position: { start: { offset: 0 } } }] };
  markNewMarkdownText(tree, value, 0);
  const children = tree.children as Array<{ type: string; value?: string }>;
  assert.equal(children.filter((child) => child.type === "element").length, 1);
  assert.equal(children.filter((child) => child.type === "element")[0].children?.[0].value.length, MAX_DECRYPTED_CHARACTERS);
});
