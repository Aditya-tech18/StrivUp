/**
 * src/components/features/strivy/richtext.ts
 *
 * A tiny, safe formatter for STRIVY's replies: paragraphs, line breaks,
 * bullet lists and **bold**. It returns plain data that the bubble renders
 * as React elements (never HTML strings, never dangerouslySetInnerHTML), so
 * nothing in a reply can inject markup. Markdown it doesn't support is shown
 * as clean text with the syntax removed, never as raw asterisks or hashes.
 */

export type Inline = { text: string; bold?: boolean };
export type Block =
  { kind: "paragraph"; lines: Inline[][] } | { kind: "list"; ordered: boolean; items: Inline[][] };

const BULLET = /^\s*(?:[•●▪◦‣*-]|\d{1,2}[.)])\s+/;
const ORDERED = /^\s*\d{1,2}[.)]\s+/;

/** "**bold** and __bold__" as segments; stray markers are dropped. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index! > last) out.push({ text: line.slice(last, m.index) });
    out.push({ text: m[1] ?? m[2], bold: true });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out
    .map((s) => ({ ...s, text: s.text.replace(/\*\*|__|`/g, "") }))
    .filter((s) => s.text.length > 0);
}

/** Splits a reply into paragraphs and lists. Headings (#) become plain lines. */
export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  const chunks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    let para: Inline[][] = [];
    let list: { ordered: boolean; items: Inline[][] } | null = null;
    const flushPara = () => {
      if (para.length) blocks.push({ kind: "paragraph", lines: para });
      para = [];
    };
    const flushList = () => {
      if (list) blocks.push({ kind: "list", ...list });
      list = null;
    };
    for (const raw of chunk.split("\n")) {
      const line = raw.replace(/^\s*#{1,6}\s+/, "");
      if (BULLET.test(line)) {
        flushPara();
        const ordered = ORDERED.test(line);
        if (!list || list.ordered !== ordered) {
          flushList();
          list = { ordered, items: [] };
        }
        list.items.push(parseInline(line.replace(BULLET, "")));
      } else if (line.trim()) {
        flushList();
        para.push(parseInline(line));
      }
    }
    flushList();
    flushPara();
  }
  return blocks;
}

/** "10:42 am" for a message id made by newId() ("m<epoch ms>-<n>"); null otherwise. */
export function messageTime(id: string, now = new Date()): string | null {
  const m = /^m(\d{12,})-/.exec(id);
  if (!m) return null;
  const at = new Date(Number(m[1]));
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const sameDay = at.toDateString() === now.toDateString();
  return sameDay
    ? time
    : `${at.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

/** "just now", "5m ago", "3h ago", "yesterday", "2 Oct", for the notification list. */
export function relativeTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const ms = now.getTime() - at.getTime();
  if (Number.isNaN(ms)) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  return at.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
