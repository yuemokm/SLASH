// Deterministic Chinese character bigrams, also used by the publisher.
export function tokenize(text: string): string {
  const words = text.toLowerCase().match(/[a-z0-9_]+|[\p{Script=Han}]+/gu) ?? [];
  return [...new Set(words.flatMap(word => /\p{Script=Han}/u.test(word)
    ? (word.length < 2 ? [word] : Array.from({length: word.length - 1}, (_, i) => word.slice(i, i + 2)))
    : [word]))].slice(0, 3000).join(' ');
}
