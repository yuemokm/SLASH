// Mark only source-aligned text added by the latest stream update. Markdown
// punctuation, escaped text and code keep their normal rendering.
type MarkdownNode = {
  type: string;
  tagName?: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start?: { offset?: number } };
  properties?: Record<string, unknown>;
};

export const MAX_DECRYPTED_CHARACTERS = 24;

export function markNewMarkdownText(
  tree: MarkdownNode,
  source: string,
  previousLength: number,
): void {
  const from = Math.max(previousLength, source.length - MAX_DECRYPTED_CHARACTERS);

  function visit(node: MarkdownNode): void {
    if (!node.children || ["pre", "code", "a"].includes(node.tagName || "")) return;
    node.children = node.children.flatMap((child) => {
      if (child.type !== "text" || !child.value) {
        visit(child);
        return [child];
      }

      const offset = child.position?.start?.offset;
      if (
        offset === undefined ||
        source.slice(offset, offset + child.value.length) !== child.value
      ) return [child];

      let split = Math.max(0, from - offset);
      if (split >= child.value.length) return [child];
      // Markdown offsets use UTF-16 indices; never split a surrogate pair.
      if (split > 0 && /[\uD800-\uDBFF]/.test(child.value[split - 1])) split--;
      const before = child.value.slice(0, split);
      const after = child.value.slice(split);
      return [
        ...(before ? [{ ...child, value: before }] : []),
        {
          type: "element",
          tagName: "span",
          properties: {
            className: ["decrypt-segment"],
            "data-decrypt-key": String(from),
          },
          children: [{ type: "text", value: after }],
        },
      ];
    });
  }

  visit(tree);
}
