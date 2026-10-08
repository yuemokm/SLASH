import type { FileRef, ProjectTreeNode, ProjectTreeRole } from "../shared/types";

export type BrowserNode = { node: ProjectTreeNode; mountId: string; prefix: string; children: BrowserNode[] };
const normalized = (value: string) => value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
export function browserTree(nodes: ProjectTreeNode[]): BrowserNode[] {
 const walk = (node: ProjectTreeNode, mountId = "", base = ""): BrowserNode | undefined => {
  const ownsMount = Boolean(node.mountId && node.mountId !== mountId);
  const id = node.mountId || mountId;
  const path = normalized(node.path || "");
  const root = ownsMount ? path : base;
  if (!id || (!ownsMount && path !== root && !path.startsWith(root + "/"))) return undefined;
  const prefix = path === root ? "" : path.slice(root.length + 1);
  return { node, mountId: id, prefix, children: node.children.map(child => walk(child, id, root)).filter((child): child is BrowserNode => Boolean(child)) };
 };
 return nodes.map(node => walk(node)).filter((node): node is BrowserNode => Boolean(node));
}
export function fileInBrowserNode(file: FileRef, node: BrowserNode) {
 const path = normalized(file.path).toLowerCase(), prefix = normalized(node.prefix).toLowerCase();
 return file.mountId === node.mountId && (!prefix || path === prefix || path.startsWith(prefix + "/"));
}
export function fileTreeRole(file: FileRef, tree: BrowserNode[]): ProjectTreeRole | undefined {
 for (const node of tree) {
  const child = fileTreeRole(file, node.children);
  if (child) return child;
  if (fileInBrowserNode(file, node)) return node.node.role;
 }
 return undefined;
}

export function preservedBrowserDirectories(paths: string[], tree: BrowserNode[]) {
 const normalizedPaths = paths.map(normalized);
 return normalizedPaths.flatMap(path => {
  const root = tree.find(item => item.node.path && path.toLowerCase().startsWith(normalized(item.node.path).toLowerCase() + "/"));
  if (!root || normalizedPaths.some(parent => parent !== path && path.toLowerCase().startsWith(parent.toLowerCase() + "/") && parent.toLowerCase().startsWith(normalized(root.node.path!).toLowerCase() + "/"))) return [];
  const prefix = path.slice(normalized(root.node.path!).length + 1);
  return [{ id: `preserved:${root.mountId}:${prefix}`, mountId: root.mountId, name: prefix, prefix }];
 });
}
