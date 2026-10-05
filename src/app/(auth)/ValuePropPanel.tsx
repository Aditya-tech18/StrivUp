/**
 * ValuePropPanel — desktop-only right panel shared by /login and /signup.
 *
 * Hidden on mobile (lg:flex). Near-black panel (primary-container) with the
 * four things the product does.
 *
 * The four cards used to show numbers: "24 days", "12 running", "4,200+",
 * "+38% / month". None of those came from anywhere, and "4,200+ Community
 * Members" in particular is a factual claim about StrivUp printed on the
 * sign-up page. Replaced with what each feature is, which is true today and
 * needs no maintenance as the real numbers move. If you want live numbers
 * here, they should come from a query, not from this file.
 */

import { Flame, TrendingUp, Users, Zap } from "lucide-react";

const features = [
  {
    Icon: Flame,
    title: "Daily streaks",
    body: "Show up, log it, keep the chain unbroken.",
    tint: "text-secondary-fixed-dim",
    bg: "bg-secondary/15",
  },
  {
    Icon: Zap,
    title: "Challenges",
    body: "Join a run with a start date and a finish line.",
    tint: "text-tertiary-fixed",
    bg: "bg-tertiary-fixed/10",
  },
  {
    Icon: Users,
    title: "A community",
    body: "People doing the same thing, visible to each other.",
    tint: "text-on-primary",
    bg: "bg-white/10",
  },
  {
    Icon: TrendingUp,
    title: "Your progress",
    body: "Every submission, kept and counted.",
    tint: "text-secondary-fixed-dim",
    bg: "bg-secondary/15",
  },
];

export function ValuePropPanel() {
  return (
    // Translucent rather than solid: the shader behind the auth screen carries
    // through, so the two halves read as one surface. Sizing and the
    // hide-on-mobile rule belong to AuthScreen, which owns the layout.
    <aside
      className="flex h-full w-full flex-col items-center justify-center border-l border-white/10 bg-primary-container/70 p-12 backdrop-blur-md"
      aria-label="What StrivUp does"
    >
      <div className="w-full max-w-sm space-y-8">
        {/* Logo mark + headline */}
        <div className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <Flame size={24} className="text-secondary-fixed" aria-hidden="true" />
          </div>
          <h2 className="text-display-mobile leading-tight text-on-primary">
            Build it<br />day by day
          </h2>
          <p className="text-body-md leading-relaxed text-on-primary-container">
            Track streaks, build habits and push your limits with a community
            that holds you accountable every single day.
          </p>
        </div>

        {/* Feature cards */}
        <ul className="list-none space-y-3">
          {features.map(({ Icon, title, body, tint, bg }) => (
            <li
              key={title}
              className={`flex items-start gap-4 rounded-xl ${bg} border border-white/20 px-4 py-3`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Icon size={20} className={tint} aria-hidden="true" />
              </div>
              <div>
                <p className="text-body-lg font-semibold text-on-primary">{title}</p>
                {/* on-primary-container (#848484) on primary-container (#1b1b1b)
                    is 4.61:1, so it clears AA. The old footer line faded it to
                    60%, which took it to 2.50:1. */}
                <p className="text-body-md text-on-primary-container">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Footer tagline */}
        <p className="text-center text-overline tracking-widest text-on-primary-container">
          StrivUp · Build better, every day
        </p>
      </div>
    </aside>
  );
}
