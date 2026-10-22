"use client";
/**
 * /business/challenges — the challenges this business runs.
 *
 * Deliberately the same screen as /business/quests: same header with the
 * language toggle and a New button, same filter tabs with live counts, same
 * card with cover, status pill, stat row and an actions strip. A business
 * owner should not have to learn a second layout because the thing in the
 * list is a challenge rather than a quest.
 *
 * Where the two differ is the data underneath, and that difference is real
 * rather than cosmetic: quests carry a quest_status column, challenges carry
 * no status at all. So the pill and the tabs here are DERIVED from what
 * challenges actually have — created_at plus duration_days decides whether
 * one is still running, and visibility decides whether it is public. Nothing
 * is invented to pad the screen out to match.
 *
 * Ownership is the pair (creator_id = business id, creator_type =
 * 'business'): a business profile's id IS its owner's profile id, so no
 * business_id column on challenges is needed.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, Lock, Plus, Target, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { StringKey } from "@/lib/i18n/businessStrings";

type Tab = "all" | "ongoing" | "ended" | "private";

const TABS: { label: StringKey; value: Tab }[] = [
  { label: "st.all", value: "all" },
  { label: "mych.ongoing", value: "ongoing" },
  { label: "mych.ended", value: "ended" },
  { label: "mych.private", value: "private" },
];

interface Row {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail_url: string | null;
  duration_days: number | null;
  visibility: string | null;
  created_at: string;
  joined: number;
}

const DAY_MS = 86_400_000;

/**
 * A challenge runs for duration_days from the day it was created, so it has
 * ended once that many days have passed. With no duration it never ends.
 */
function hasEnded(c: Row): boolean {
  if (!c.duration_days || c.duration_days <= 0) return false;
  return Date.now() > new Date(c.created_at).getTime() + c.duration_days * DAY_MS;
}

function matchesTab(c: Row, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "private") return c.visibility === "private";
  if (tab === "ended") return hasEnded(c);
  return !hasEnded(c);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function BusinessChallengesPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const { t } = useLocale();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login?redirectTo=/business/challenges"); return; }

      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }

      const { data, error } = await supabase
        .from("challenges")
        .select("id,title,description,category,thumbnail_url,duration_days,visibility,created_at")
        .eq("creator_id", bp.id)
        .eq("creator_type", "business")
        .order("created_at", { ascending: false });

      if (error) { console.error("[business/challenges]", error.message); setLoading(false); return; }

      const list = (data ?? []) as Omit<Row, "joined">[];
      const ids = list.map((c) => c.id);

      /* One read for every join across every challenge, tallied here. A count
         per challenge would be N round trips for a number one query already
         contains. */
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: parts, error: pErr } = await supabase
          .from("challenge_participants")
          .select("challenge_id")
          .in("challenge_id", ids);
        if (pErr) console.error("[business/challenges] participants", pErr.message);
        for (const row of (parts ?? []) as { challenge_id: string }[]) {
          counts.set(row.challenge_id, (counts.get(row.challenge_id) ?? 0) + 1);
        }
      }

      setRows(list.map((c) => ({ ...c, joined: counts.get(c.id) ?? 0 })));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => rows.filter((c) => matchesTab(c, tab)), [rows, tab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-28">
      {/* Header — same shape as My Quests */}
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 py-4 flex items-center gap-3 sticky top-0 z-30 pt-safe">
        <Link aria-label={t("mych.back")} href="/business/dashboard">
          <ArrowLeft size={22} className="text-on-surface-variant" />
        </Link>
        <h1 className="text-body-lg font-black text-on-surface flex-1">{t("mych.title")}</h1>
        <LanguageToggle className="shrink-0" />
        <button onClick={() => router.push("/business/challenges/new")}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-secondary text-white text-sm font-bold tap-target">
          <Plus size={16} aria-hidden="true" /> {t("mych.newChallenge")}
        </button>
      </div>

      {/* Tabs with live counts */}
      <div className="bg-surface-container-lowest border-b border-outline-variant px-5 flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map((opt) => (
          <button key={opt.value} onClick={() => setTab(opt.value)}
            className={`shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === opt.value ? "border-secondary text-secondary" : "border-transparent text-on-surface-variant"
            }`}>
            {t(opt.label)}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              tab === opt.value ? "bg-secondary-fixed text-secondary" : "bg-surface-container text-on-surface-variant"
            }`}>
              {rows.filter((c) => matchesTab(c, opt.value)).length}
            </span>
          </button>
        ))}
      </div>

      <div className="px-5 py-5 mx-auto measure-page flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant elev-1 surface-raised">
            <div className="w-16 h-16 rounded-2xl bg-secondary-fixed flex items-center justify-center">
              <Plus size={28} className="text-secondary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-body-lg font-black text-on-surface">{t("mych.emptyTitle")}</p>
              <p className="text-sm text-on-surface-variant mt-1 max-w-xs">{t("mych.emptyBody")}</p>
            </div>
            <button onClick={() => router.push("/business/challenges/new")}
              className="h-11 px-6 rounded-xl bg-secondary text-white font-bold text-sm">
              {t("mych.createFirst")}
            </button>
          </div>
        ) : (
          filtered.map((c) => {
            const ended = hasEnded(c);
            const isPrivate = c.visibility === "private";
            return (
              <div key={c.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden elev-1 surface-raised">
                <div className="flex gap-4 p-4">
                  <div className="w-20 h-20 rounded-xl bg-surface-container overflow-hidden shrink-0">
                    {c.thumbnail_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.thumbnail_url} alt={c.title} className="w-full h-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center bg-surface-container-high">
                          <Target size={22} className="text-on-surface-variant opacity-50" aria-hidden="true" />
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-body-lg font-bold text-on-surface leading-tight line-clamp-2">{c.title}</h3>
                      <span className={`shrink-0 text-label-sm font-bold px-2 py-0.5 rounded-full ${
                        ended ? "bg-surface-container text-on-surface-variant"
                              : "bg-success-container text-on-success-container"
                      }`}>
                        {t(ended ? "mych.ended" : "mych.ongoing")}
                      </span>
                    </div>
                    {c.category && <p className="text-xs text-on-surface-variant mb-2">{c.category}</p>}
                    <div className="flex items-center gap-4 text-xs text-on-surface-variant flex-wrap">
                      <span className="flex items-center gap-1"><Users size={12} aria-hidden="true" />{c.joined}</span>
                      {c.duration_days ? (
                        <span className="flex items-center gap-1">
                          <Clock size={12} aria-hidden="true" />{c.duration_days} {t("mych.days")}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <CalendarDays size={12} aria-hidden="true" />{t("mych.created")} {formatDate(c.created_at)}
                      </span>
                      {isPrivate && (
                        <span className="flex items-center gap-1">
                          <Lock size={12} aria-hidden="true" />{t("mych.private")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-outline-variant px-4 py-2.5 flex items-center gap-2">
                  <Link href={`/challenges/${c.id}`}
                    className="flex-1 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low tap-target">
                    {t("mych.view")}
                  </Link>
                  <Link href={`/challenges/${c.id}/edit`}
                    className="flex-1 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low tap-target">
                    {t("mych.edit")}
                  </Link>
                  <Link href={`/challenges/${c.id}/leaderboard`}
                    className="flex-1 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low tap-target">
                    {t("mych.participants")}
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
