import { strict as assert } from "node:assert";
import { test } from "node:test";
import { browserTree, fileInBrowserNode, fileTreeRole } from "../src/project-browser";

test("browser categories follow applied roles and real mount-relative child paths", () => {
 const tree = browserTree([
  { id: "resource", name: "项目参考", path: "项目参考", role: "resource", mountId: "ref", children: [
   { id: "templates", name: "模板", path: "项目参考/模板", role: "resource", mountId: "ref", children: [
    { id: "prd", name: "PRD", path: "项目参考/模板/PRD", role: "resource", mountId: "ref", children: [] },
   ] },
  ] },
  { id: "output", name: "交付", path: "交付", role: "output", mountId: "out", children: [] },
 ]);
 const prd = tree[0].children[0].children[0];
 assert.equal(tree[0].prefix, "");assert.equal(prd.prefix, "模板/PRD");
 assert.equal(fileInBrowserNode({ mountId: "ref", path: "模板\\PRD\\订单.md", size: 1 }, prd), true);
 assert.equal(fileInBrowserNode({ mountId: "ref", path: "模板/PRD备份/订单.md", size: 1 }, prd), false);
 assert.equal(fileTreeRole({ mountId: "out", path: "任何新增分类/文件.md", size: 1 }, tree), "output");
 assert.equal(fileTreeRole({ mountId: "ref", path: "已删除分类仍保留/旧.md", size: 1 }, tree), "resource");
 assert.equal(fileTreeRole({ mountId: "other-project", path: "模板/PRD/订单.md", size: 1 }, tree), undefined);
});
