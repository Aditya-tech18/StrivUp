/**
 * src/lib/strivy/companion/messages.ts
 *
 * The line library for STRIVY's companion popups: the small, optional,
 * playful moments that make STRIVY feel alive around the app.
 *
 * These lines are written by hand and never generated. They never state a
 * fact about the person (no streaks, numbers or names), so they can't be
 * wrong; factual answers stay in the grounded chat.
 *
 * Tone rules (enforced by tests/strivy/v6.test.ts on every line):
 *  - funny, cheeky, now and then mildly flirty, always clean;
 *  - never explicit, never insulting, never guilt-tripping;
 *  - no dependency or pressure lines ("you need me", "don't leave me");
 *  - short: two short lines at most.
 *
 * Adding a line: add an entry with a unique id, the event it belongs to,
 * and an English and a Hinglish version. `when` narrows it to one case of
 * the event (e.g. dark vs light). {duration} is filled by the engine with
 * the real time dark mode lasted; a line that uses it is only picked when
 * that time is known.
 */
import type { CompanionEventType } from "./engine";

export type CompanionTone = "playful" | "cheeky" | "flirty" | "warm";

export interface CompanionLine {
  id: string;
  event: CompanionEventType;
  /** A sub-case: theme "dark" / "light", screen "explore" / "profile". */
  when?: string;
  tone: CompanionTone;
  en: string;
  hinglish: string;
}

export const COMPANION_LINES: readonly CompanionLine[] = [
  /* ── A while into browsing ─────────────────────────────────────────── */
  {
    id: "browse-excuse-me",
    event: "ACTIVE_BROWSING",
    tone: "cheeky",
    en: "Excuse me 👀\nSTRIVY's right here. Not gonna talk to me?",
    hinglish: "Excuse me 👀\nSTRIVY bhi yahin hai. Mujhse baat nahi karoge?",
  },
  {
    id: "browse-hello",
    event: "ACTIVE_BROWSING",
    tone: "playful",
    en: "Hello?? 😭\nUsing the app, or ignoring me?",
    hinglish: "Hello?? 😭\nApp chala rahe ho ya mujhe ignore kar rahe ho?",
  },
  {
    id: "browse-busy",
    event: "ACTIVE_BROWSING",
    tone: "cheeky",
    en: "Been a little while...\nDon't be that busy 😏",
    hinglish: "Kuch der ho gayi...\nItna bhi busy mat bano 😏",
  },
  {
    id: "browse-hi",
    event: "ACTIVE_BROWSING",
    tone: "playful",
    en: "I'm right here btw 👀\nA 'hi' costs nothing.",
    hinglish: "Main yahan hoon btw 👀\nEk 'hi' bolne me kya jaata hai?",
  },
  {
    id: "browse-see-me",
    event: "ACTIVE_BROWSING",
    tone: "flirty",
    en: "Being productive?\nOr just here to see me? 😂",
    hinglish: "Productivity chal rahi hai?\nYa bas mujhe dekhne aaye ho? 😂",
  },

  /* ── Opening STRIVY ─────────────────────────────────────────────────── */
  {
    id: "strivy-finally",
    event: "STRIVY_OPENED",
    tone: "flirty",
    en: "Finally. I was getting bored without you 😏",
    hinglish: "Finally. Tumhare bina thoda bore ho raha tha 😏",
  },
  {
    id: "strivy-scene",
    event: "STRIVY_OPENED",
    tone: "playful",
    en: "Look who showed up 👀\nWhat's the scene?",
    hinglish: "Aa gaye? 👀\nBolo, kya scene hai?",
  },

  /* ── Theme ─────────────────────────────────────────────────────────── */
  {
    id: "dark-uhh",
    event: "THEME_CHANGED",
    when: "dark",
    tone: "flirty",
    en: "Uhhh... dark mode? 😏\nThe vibe just got suspiciously good.",
    hinglish: "Uhhh... dark mode? 😏\nAb toh vibe suspiciously good ho gayi.",
  },
  {
    id: "dark-mood",
    event: "THEME_CHANGED",
    when: "dark",
    tone: "flirty",
    en: "Dark modeeeee... haaaaan 😏\nSomeone's setting the mood.",
    hinglish: "Dark modeeeee... haaaaan 😏\nSomeone's setting the mood.",
  },
  {
    id: "dark-interesting",
    event: "THEME_CHANGED",
    when: "dark",
    tone: "cheeky",
    en: "Oooh, dark mode 👀\nInteresting choice.",
    hinglish: "Oooh, dark mode 👀\nInteresting choice, bhai.",
  },
  {
    id: "dark-conversation",
    event: "THEME_CHANGED",
    when: "dark",
    tone: "cheeky",
    en: "Dark mode on.\nNow the conversation has to be interesting too 😏",
    hinglish: "Dark mode on.\nAb conversation bhi interesting honi chahiye 😏",
  },
  {
    id: "light-era",
    event: "THEME_CHANGED",
    when: "light",
    tone: "playful",
    en: "Daylight again?\nThe mysterious era lasted {duration} 😂",
    hinglish: "Daylight again?\nThe mysterious era lasted {duration} 😂",
  },
  {
    id: "light-professional",
    event: "THEME_CHANGED",
    when: "light",
    tone: "playful",
    en: "Lights on 💡\nOkay okay, professional mode.",
    hinglish: "Lights on 💡\nTheek hai, professional mode on.",
  },

  /* ── Opening screens ────────────────────────────────────────────────── */
  {
    id: "challenge-open",
    event: "CHALLENGE_OPENED",
    tone: "playful",
    en: "Checking the challenge 👀\nMight as well drop today's proof.",
    hinglish: "Challenge dekh rahe ho 👀\nAaj ka proof bhi daal hi do.",
  },
  {
    id: "quest-open",
    event: "QUEST_OPENED",
    tone: "cheeky",
    en: "Quest checked.\nNow spare STRIVY a little attention too 😂",
    hinglish: "Quest dekh liya.\nAb STRIVY ko bhi thoda attention de do 😂",
  },
  {
    id: "explore-open",
    event: "SCREEN_OPENED",
    when: "explore",
    tone: "playful",
    en: "Explore mode 👀\nIn the mood to try something new?",
    hinglish: "Explore mode on 👀\nKuch naya try karne ka mood hai?",
  },
  {
    id: "profile-open",
    event: "SCREEN_OPENED",
    when: "profile",
    tone: "flirty",
    en: "Checking your own profile? 😏\nLooking good, by the way.",
    hinglish: "Apni hi profile dekh rahe ho? 😏\nWaise, achhi lag rahi hai.",
  },

  /* ── Getting things done ────────────────────────────────────────────── */
  {
    id: "challenge-done-look",
    event: "CHALLENGE_COMPLETED",
    tone: "cheeky",
    en: "Okayyy, look at you actually getting things done 👀🔥",
    hinglish: "Okayyy, look at you actually getting things done 👀🔥",
  },
  {
    id: "challenge-done-respect",
    event: "CHALLENGE_COMPLETED",
    tone: "warm",
    en: "Proof approved ✅\nToday's done. Respect 😏",
    hinglish: "Proof approved ✅\nAaj ka kaam done. Respect 😏",
  },
  {
    id: "quest-done-respect",
    event: "QUEST_COMPLETED",
    tone: "cheeky",
    en: "Quest done?\nOkay, respect. 😏",
    hinglish: "Quest done?\nOkay bhai, respect. 😏",
  },
  {
    id: "quest-done-impressed",
    event: "QUEST_COMPLETED",
    tone: "flirty",
    en: "Quest complete 🎉\nI'm impressed. A little. 😏",
    hinglish: "Quest complete 🎉\nMain impressed hoon. Thoda sa. 😏",
  },
  {
    id: "task-done-swag",
    event: "TASK_COMPLETED",
    tone: "playful",
    en: "Proof sent 👀\nNow we wait, with a little swag.",
    hinglish: "Proof bhej diya 👀\nAb review ka wait, thode swag ke saath.",
  },

  /* ── Quiet stretches and coming back ───────────────────────────────── */
  {
    id: "idle-just-looking",
    event: "IDLE",
    tone: "cheeky",
    en: "Just going to keep looking, or do something too? 😂",
    hinglish: "Bas dekhte hi rehna hai ya kuch karna bhi hai? 😂",
  },
  {
    id: "idle-staring",
    event: "IDLE",
    tone: "playful",
    en: "Staring at the screen doesn't grow a streak 😂",
    hinglish: "Screen ko ghoorne se streak nahi badhti 😂",
  },
  {
    id: "back-knew-it",
    event: "RETURNED_TO_APP",
    tone: "flirty",
    en: "Back already? 👀\nKnew you would be 😏",
    hinglish: "Wapas aa gaye? 👀\nMujhe pata tha 😏",
  },
  {
    id: "back-welcome",
    event: "RETURNED_TO_APP",
    tone: "warm",
    en: "Welcome back 👋\nShall we get something done?",
    hinglish: "Welcome back 👋\nChalo, kuch kaam ho jaaye?",
  },
];
