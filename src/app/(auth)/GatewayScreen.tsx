import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Camera,
  CircleCheck,
  CodeXml,
  Coins,
  Flame,
  Footprints,
  MapPin,
  Target,
  Trophy,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { RotatingWord } from "@/components/ui/RotatingWord";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import styles from "./GatewayScreen.module.css";

const headlineWords = ["Growth", "Discipline", "Streaks", "Challenges", "Consistency"];

const steps = [
  {
    icon: Target,
    title: "Pick a challenge",
    description:
      "Find a goal you care about, check the rules, and join on your own or with friends.",
  },
  {
    icon: Camera,
    title: "Do the work",
    description:
      "Finish the daily task and submit the proof your challenge asks for. You can leave while it’s reviewed.",
  },
  {
    icon: Trophy,
    title: "See your progress",
    description:
      "Verified activity counts toward your progress. Build a streak and earn StrivCoins on eligible activities.",
  },
];

const ideas = [
  {
    icon: Footprints,
    color: "blue",
    category: "Fitness",
    title: "Morning Run Club",
    description: "Make getting outside before work part of your routine.",
  },
  {
    icon: CodeXml,
    color: "green",
    category: "Learning",
    title: "100 Days of Code",
    description: "Build a little every day and show what you shipped.",
  },
  {
    icon: MapPin,
    color: "gold",
    category: "Local quest",
    title: "Filter Coffee Trail",
    description: "Turn a walk around your neighbourhood into a quest.",
  },
];

export function GatewayScreen() {
  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link className={styles.brand} href="/">
            <span aria-hidden="true">
              <BrandMark variant="mark" height={26} priority />
            </span>
            StrivUp
          </Link>
          <nav aria-label="Homepage" className={styles.nav}>
            <a href="#how-it-works">How it works</a>
            <Link href="/how-quests-work">Local quests</Link>
          </nav>
          <div className={styles.headerActions}>
            <ThemeToggle compact />
            <Link className={styles.login} href="/login">
              Log in
            </Link>
          </div>
        </div>
      </header>

      <main className={styles.container}>
        <section className={styles.hero} aria-labelledby="homepage-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <Flame size={17} aria-hidden="true" /> Build better. Every day.
            </p>
            <h1 id="homepage-title">
              <span className={styles.heroLead}>India&apos;s platform for</span>{" "}
              <RotatingWord words={headlineWords} className={styles.heroWord} />
            </h1>
            <p className={styles.heroDescription}>
              Join a challenge, share proof of what you did, and build a streak with people working
              toward the same goal.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryButton} href="/signup?redirectTo=%2Fexplore">
                Start your first challenge <ArrowRight size={19} aria-hidden="true" />
              </Link>
              <a className={styles.secondaryButton} href="#how-it-works">
                How it works <ArrowDown size={17} aria-hidden="true" />
              </a>
            </div>
          </div>

          <figure className={styles.heroMedia}>
            <Image
              src="/home/park-run.webp"
              alt="Two runners on a tree-lined path in Bengaluru"
              fill
              preload
              sizes="(max-width: 740px) calc(100vw - 36px), (max-width: 1200px) 49vw, 580px"
              className={styles.heroImage}
            />
            <figcaption className={styles.proofCard}>
              <span className={styles.proofIcon}>
                <CircleCheck size={22} aria-hidden="true" />
              </span>
              <span className={styles.proofText}>
                <small>Example check-in</small>
                <strong>Morning run verified</strong>
              </span>
              <span className={styles.streak}>
                <Flame size={15} aria-hidden="true" /> 7-day streak
              </span>
            </figcaption>
          </figure>
        </section>

        <section id="how-it-works" className={styles.section} aria-labelledby="how-it-works-title">
          <h2 id="how-it-works-title">How it works</h2>
          <ol className={styles.grid}>
            {steps.map(({ icon: Icon, title, description }) => (
              <li className={styles.step} key={title}>
                <span className={styles.stepIcon}>
                  <Icon size={23} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section} aria-labelledby="challenge-ideas-title">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="challenge-ideas-title">Find your next challenge</h2>
              <p>Ideas to get you started, from daily practice to local quests.</p>
            </div>
            <Link className={styles.textLink} href="/explore">
              Explore challenges <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <ul className={styles.grid}>
            {ideas.map(({ icon: Icon, color, category, title, description }) => (
              <li className={styles.idea} data-color={color} key={title}>
                <div className={styles.ideaArtwork}>
                  <span>{category}</span>
                  <Icon size={58} strokeWidth={1.35} aria-hidden="true" />
                </div>
                <div className={styles.ideaCopy}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link className={styles.textLink} href="/how-quests-work">
            See how local quests work <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>

        <section className={styles.rewards} aria-labelledby="strivcoins-title">
          <span className={styles.coinIcon}>
            <Coins size={27} aria-hidden="true" />
          </span>
          <div>
            <h2 id="strivcoins-title">Earn StrivCoins as you go</h2>
            <p>See your balance, how you earned it, and what StrivCoins unlock.</p>
          </div>
          <Link className={styles.secondaryButton} href="/coins">
            View StrivCoins <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>

        <section className={styles.join} aria-labelledby="get-started-title">
          <div>
            <h2 id="get-started-title">Ready to start?</h2>
            <p>Pick one thing you’d like to do more often.</p>
          </div>
          <Link className={styles.primaryButton} href="/signup?redirectTo=%2Fexplore">
            Create an account <ArrowRight size={19} aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className={`${styles.container} ${styles.footer}`}>
        <Link className={styles.brand} href="/">
          <span aria-hidden="true">
            <BrandMark variant="mark" height={26} />
          </span>
          StrivUp
        </Link>
        <nav aria-label="Footer" className={styles.footerNav}>
          <Link href="/business-login">Business sign-in</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
}
