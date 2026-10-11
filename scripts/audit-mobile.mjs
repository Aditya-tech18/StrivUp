/**
 * audit-mobile.mjs — walks the app at phone size and reports layout failures.
 *
 *   npm run build && npm start      # in one shell
 *   node scripts/audit-mobile.mjs   # in another
 *
 * Three checks, each of which has caught a real bug in this codebase that
 * reading the class names did not:
 *
 *   overflow  the page scrolls sideways.
 *
 *   small     an interactive control under 44px tall. Skips .tap-target,
 *             whose 44px box is a ::after overlay that getBoundingClientRect
 *             cannot see, and skips links sitting inline inside a sentence,
 *             which WCAG 2.5.8 exempts.
 *
 *   crushed   text squeezed under 48px wide by a flex sibling. This is what
 *             the quest task list looked like when every title rendered as
 *             "Tr", "M", "Ex". Skips .sr-only, and skips crossfade stacks
 *             (the password meter, the rotating headline), which put every
 *             variant in one grid cell with the inactive ones aria-hidden, so
 *             textContent concatenates them while the box is one label wide.
 *
 *   heights   an element carrying h-10/11/12/14 that renders shorter than the
 *             class asks for. In a COLUMN flex container `flex-1` sets
 *             flex-basis on the main axis, which is the height, and that beats
 *             h-*: two CTAs on /how-quests-work rendered 20px tall instead of
 *             48 until this check found them.
 *
 * Only the publicly reachable routes are listed. The signed-in app is behind
 * the auth guard in proxy.ts, and the guard is not something to weaken for a
 * test run; those screens need a session and a real device pass.
 */

import { chromium, devices } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://localhost:3000";
const PAGES = [
  "/", "/privacy", "/delete-account", "/offline", "/how-quests-work",
  "/login", "/signup", "/business-login", "/business-signup", "/forgot-password",
];
const WANT_HEIGHT = { "h-10": 40, "h-11": 44, "h-12": 48, "h-14": 56 };

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}
);
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const page = await ctx.newPage();

let findings = 0;

for (const path of PAGES) {
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => null);
  if (!res || res.status() >= 400) {
    console.log(`${path.padEnd(18)} HTTP ${res?.status() ?? "unreachable"}`);
    findings++;
    continue;
  }

  const r = await page.evaluate((WANT) => {
    const de = document.documentElement;

    const small = [...document.querySelectorAll('button,[role="button"],[role="tab"],input,select,a[href]')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        if (box.height === 0 || box.width === 0 || box.height >= 44) return false;
        if (el.classList.contains("tap-target") || el.closest(".sr-only")) return false;
        const p = el.parentElement;
        const inline =
          p && ["P", "LI", "SPAN"].includes(p.tagName) &&
          p.textContent.trim().length > el.textContent.trim().length + 4;
        return !inline;
      })
      .map((el) => {
        const b = el.getBoundingClientRect();
        const label = (el.textContent || el.getAttribute("aria-label") || "").trim();
        return `${el.tagName.toLowerCase()} ${Math.round(b.width)}x${Math.round(b.height)} "${label.slice(0, 20)}"`;
      });

    const crushed = [...document.querySelectorAll("h1,h2,h3,p,span")]
      .filter((el) => {
        if (el.querySelector("[aria-hidden='true']")) return false;
        if (el.classList.contains("sr-only") || el.closest(".sr-only")) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.width < 48 && (el.textContent || "").trim().length > 8;
      })
      .map((el) => `${el.tagName.toLowerCase()} ${Math.round(el.getBoundingClientRect().width)}px "${el.textContent.trim().slice(0, 18)}"`);

    const heights = [];
    for (const el of document.querySelectorAll("*")) {
      const cls = (el.className || "").toString();
      for (const [k, px] of Object.entries(WANT)) {
        if (!new RegExp(`(^| )${k}( |$)`).test(cls)) continue;
        const h = el.getBoundingClientRect().height;
        if (h > 0 && h < px - 2) {
          heights.push(`${el.tagName.toLowerCase()} ${k} renders ${Math.round(h)}px "${(el.textContent || "").trim().slice(0, 18)}"`);
        }
      }
    }

    return { overflow: de.scrollWidth - de.clientWidth, small, crushed, heights };
  }, WANT_HEIGHT);

  const n = (r.overflow > 0 ? 1 : 0) + r.small.length + r.crushed.length + r.heights.length;
  findings += n;
  console.log(
    `${path.padEnd(18)} overflow=${r.overflow}px  small=${r.small.length}  crushed=${r.crushed.length}  heights=${r.heights.length}`
  );
  for (const [name, list] of [["small", r.small], ["crushed", r.crushed], ["heights", r.heights]]) {
    if (list.length) console.log(`     ${name}: ${list.slice(0, 4).join(" | ")}`);
  }
}

await browser.close();
console.log(findings === 0 ? "\nclean" : `\n${findings} finding(s)`);
process.exitCode = findings === 0 ? 0 : 1;
