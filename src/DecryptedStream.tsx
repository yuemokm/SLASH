import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { markNewMarkdownText } from "./decrypted-text";

const SYMBOLS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HAN = "星海山林云光风月天地春秋";

function canDecrypt(character: string): boolean {
  return /[\p{L}\p{N}]/u.test(character);
}

function scrambled(character: string, index: number, tick: number): string {
  const pool = /[\p{Script=Han}]/u.test(character) ? HAN : SYMBOLS;
  return pool[(index * 13 + tick * 17 + character.codePointAt(0)!) % pool.length];
}

function DecryptedSegment({ text, reducedMotion }: { text: string; reducedMotion: boolean }) {
  const [tick, setTick] = useState(0);
  const letters = Array.from(text).filter(canDecrypt).length;

  useEffect(() => {
    if (reducedMotion || !letters || tick >= letters + 2) return;
    const timer = window.setTimeout(() => setTick((value) => value + 1), 45);
    return () => window.clearTimeout(timer);
  }, [letters, reducedMotion, tick]);

  if (reducedMotion || !letters || tick >= letters + 2) return <>{text}</>;

  let letterIndex = 0;
  return <>{Array.from(text).map((character, index) => {
    if (!canDecrypt(character)) return character;
    const position = letterIndex++;
    return (
      <span
        className="decrypt-char"
        data-glyph={tick >= position + 2 ? character : scrambled(character, position, tick)}
        key={index}
      >
        {character}
      </span>
    );
  })}</>;
}

export function DecryptedStream({ text }: { text: string }) {
  const previous = useRef("");
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const previousLength = text.startsWith(previous.current) ? previous.current.length : text.length;
  useEffect(() => { previous.current = text; }, [text]);
  const plugin = () => (tree: Parameters<typeof markNewMarkdownText>[0]) => {
    if (!reducedMotion) markNewMarkdownText(tree, text, previousLength);
  };

  return (
    <div className="prose">
      <ReactMarkdown
        skipHtml
        rehypePlugins={[plugin]}
        components={{
          a: ({ children }) => <span className="text-link">{children}</span>,
          span: ({ children, node }) => (
            <DecryptedSegment
              key={String(node?.properties?.["data-decrypt-key"] || "")}
              text={String(children)}
              reducedMotion={reducedMotion}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
