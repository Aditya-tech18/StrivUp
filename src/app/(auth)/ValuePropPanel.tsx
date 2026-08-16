/**
 * ValuePropPanel — desktop-only right panel shared by /login and /signup.
 *
 * Hidden on mobile (lg:flex). Dark navy background with stat cards that
 * reinforce STRIV's value proposition.
 */

import { Flame, TrendingUp, Users, Zap } from "lucide-react";

const stats = [
  {
    icon: <Flame size={20} className="text-secondary-fixed-dim" aria-hidden="true" />,
    label: "Current Streak",
    value: "24 days",
    bg: "bg-secondary/15",
  },
  {
    icon: <Zap size={20} className="text-tertiary-fixed" aria-hidden="true" />,
    label: "Active Challenges",
    value: "12 running",
    bg: "bg-tertiary-fixed/10",
  },
  {
    icon: <Users size={20} className="text-on-primary-container" aria-hidden="true" />,
    label: "Community Members",
    value: "4,200+",
    bg: "bg-white/8",
  },
  {
    icon: <TrendingUp size={20} className="text-secondary-fixed-dim" aria-hidden="true" />,
    label: "Avg. Progress",
    value: "+38% / month",
    bg: "bg-secondary/15",
  },
];

export function ValuePropPanel() {
  return (
    <aside
      className="hidden lg:flex lg:w-1/2 bg-primary-container flex-col items-center justify-center p-12"
      aria-label="STRIV value proposition"
    >
      <div className="max-w-xs w-full space-y-8">
        {/* Logo mark + headline */}
        <div className="space-y-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
            <Flame size={24} className="text-secondary-fixed" aria-hidden="true" />
          </div>
          <h2 className="type-display-lg text-on-primary leading-tight">
            Analyze Your<br />Potential
          </h2>
          <p className="type-body-md text-on-primary-container leading-relaxed">
            Track streaks, build habits, and push your limits with a community
            that holds you accountable every single day.
          </p>
        </div>

        {/* Stat cards */}
        <div className="space-y-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`flex items-center gap-4 ${stat.bg} rounded-xl px-4 py-3 border border-white/8`}
            >
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                {stat.icon}
              </div>
              <div>
                <p className="type-label-caps text-on-primary-container">{stat.label}</p>
                <p className="type-headline-sm text-on-primary">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer tagline */}
        <p className="type-label-caps text-on-primary-container/60 text-center tracking-widest">
          STRIV · Build. Grow. Dominate.
        </p>
      </div>
    </aside>
  );
}
