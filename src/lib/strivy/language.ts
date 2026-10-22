/**
 * src/lib/strivy/language.ts
 *
 * Lightweight, deterministic language detection so Strivy can answer in the
 * style the person wrote in. No translation API and no model: a script check
 * plus small word lists.
 *
 *   en        English (the default and the fallback)
 *   hinglish  Hindi written in Latin letters, alone or mixed with English
 *             ("meri streak kaisi h", "bhai what is my quest?")
 *   hi        Hindi in Devanagari ("मेरा क्वेस्ट क्या है?")
 *   bho       Bhojpuri in Devanagari ("हमार क्वेस्ट का बा?")
 *
 * Bhojpuri written in Latin letters ("ka haal ba?") keeps the "hinglish"
 * code, since it shares the script, but isRomanBhojpuri() flags it: small talk
 * then uses Roman Bhojpuri templates and a local model is asked to answer in
 * Roman Bhojpuri. Data answers without their own template use Hinglish. A message with no signal of its own ("ok", "?", "streak?")
 * keeps the language of the person's previous message.
 *
 * Adding a language means adding a code here and templates in phrases.ts;
 * anything without a template falls back to English.
 */
import type { ChatTurn } from "./types";

export type StrivyLang = "en" | "hinglish" | "hi" | "bho";

export const SUPPORTED_LANGS: readonly StrivyLang[] = ["en", "hinglish", "hi", "bho"];

const DEVANAGARI = /[ऀ-ॿ]/;

/** Words that mark Bhojpuri rather than Hindi. "का" is Hindi too, so it's not here. */
const BHOJPURI_WORDS = new Set([
  "बा",
  "बाटे",
  "बाड़े",
  "बाड़ी",
  "बानी",
  "बाटी",
  "हमार",
  "हमरा",
  "तोहार",
  "तोहरा",
  "राउर",
  "रउआ",
  "केतना",
  "कइसे",
  "कइसन",
  "भइल",
  "गइल",
  "नइखे",
  "बाचल",
  "एगो",
  "कवन",
  "कवनो",
  "करीं",
  "बताईं",
]);

/** Roman Hindi words that don't collide with English. One is enough. */
const HINGLISH_STRONG = new Set([
  "kya",
  "kyaa",
  "kaisi",
  "kaisa",
  "kaise",
  "mera",
  "meri",
  "mere",
  "mujhe",
  "tera",
  "teri",
  "kitna",
  "kitne",
  "kitni",
  "hua",
  "hui",
  "bhai",
  "bhaiya",
  "yaar",
  "aaj",
  "krna",
  "karna",
  "karu",
  "kru",
  "bache",
  "bacha",
  "baaki",
  "baki",
  "mila",
  "mili",
  "nahi",
  "nhi",
  "nahin",
  "hai",
  "hain",
  "abhi",
  "batao",
  "bata",
  "kuch",
  "kaun",
  "kaunsa",
  "kahan",
  "chahiye",
  "gaya",
  "raha",
  "rha",
  "kyun",
  "kyu",
  "matlab",
  "hamar",
  "tohar",
  "kaam",
  "namaste",
  "shukriya",
]);

/** Roman Hindi words that are short or ambiguous. Two are needed. */
const HINGLISH_WEAK = new Set([
  "h",
  "ho",
  "hu",
  "hoon",
  "ab",
  "kab",
  "se",
  "ke",
  "ki",
  "ko",
  "ka",
  "tak",
  "pe",
  "aur",
  "bhi",
  "toh",
  "ba",
  "kar",
  "karo",
  "koi",
  "wala",
  "wali",
]);

/** Common English words: evidence the message is English, not a bare keyword. */
const ENGLISH_WORDS = new Set([
  "what",
  "whats",
  "how",
  "hows",
  "my",
  "is",
  "the",
  "did",
  "do",
  "i",
  "am",
  "are",
  "show",
  "any",
  "anything",
  "much",
  "many",
  "have",
  "should",
  "when",
  "why",
  "hey",
  "hi",
  "hello",
  "thanks",
  "can",
  "you",
  "me",
  "tell",
  "get",
  "earn",
  "need",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘`']/g, "")
    .split(/[\s?.!,;:()"“”।॥\-]+/)
    .filter(Boolean);
}

/** The language of one message, or null when it gives no signal. */
export function detectMessageLanguage(message: string): StrivyLang | null {
  const words = tokens(message);
  if (words.length === 0) return null;

  if (DEVANAGARI.test(message)) {
    return words.some((w) => BHOJPURI_WORDS.has(w)) ? "bho" : "hi";
  }

  // Roman Bhojpuri shares Hinglish's script and templates (see isRomanBhojpuri).
  if (words.some((w) => ROMAN_BHOJPURI.has(w))) return "hinglish";

  const strong = words.filter((w) => HINGLISH_STRONG.has(w)).length;
  const weak = words.filter((w) => HINGLISH_WEAK.has(w)).length;
  if (strong >= 1 || weak >= 2) return "hinglish";

  if (words.some((w) => ENGLISH_WORDS.has(w))) return "en";
  return null;
}

/** Roman-script words that mark Bhojpuri ("ka haal ba", "hum theek bani"). */
const ROMAN_BHOJPURI = new Set([
  "ba",
  "baa",
  "bani",
  "baani",
  "bate",
  "baate",
  "badu",
  "baadu",
  "badua",
  "baadan",
  "hamar",
  "hamra",
  "tohar",
  "tohra",
  "raua",
  "rauaa",
  "rauwa",
  "kaisan",
  "naikhe",
  "nikhe",
  "bhail",
  "gail",
  "karatani",
  "ketna",
  "hawe",
  "hauaa",
]);

/**
 * Bhojpuri typed in Roman letters. The reply language stays "hinglish" (the
 * templates have no Roman Bhojpuri), but a model can match the dialect.
 */
export function isRomanBhojpuri(message: string): boolean {
  if (DEVANAGARI.test(message)) return false;
  const words = tokens(message);
  const hits = words.filter((w) => ROMAN_BHOJPURI.has(w));
  // Only when it's clearly Bhojpuri: a lone "ba" could be anything, and a
  // model asked for a dialect it wasn't given tends to invent one.
  return (
    hits.length >= 2 ||
    hits.some((w) => !ROMAN_BHOJPURI_SHORT.has(w)) ||
    /\b(haal|hal) baa?\b|\bka baa?\b/.test(words.join(" "))
  );
}

/** Bhojpuri markers too short to count on their own. */
const ROMAN_BHOJPURI_SHORT = new Set(["ba", "baa"]);

/**
 * The language to reply in: this message's, or the person's most recent
 * message that had one, or English.
 */
export function detectLanguage(message: string, history: ChatTurn[] = []): StrivyLang {
  const own = detectMessageLanguage(message);
  if (own) return own;
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "user") continue;
    const lang = detectMessageLanguage(turn.text);
    if (lang) return lang;
  }
  return "en";
}
