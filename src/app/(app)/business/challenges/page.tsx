"use client";
/**
 * /business/challenges — the challenges this business runs.
 *
 * Scoped by (creator_id = business id, creator_type = 'business'). A business
 * profile's id IS its owner's profile id, so that pair identifies ownership
 * without a business_id column on challenges.
 *
 * Join counts come from a single grouped read rather than one query per
 * challenge, so the list costs two round trips whatever its length.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Target, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyBusinessProfile } from "@/lib/data/business";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface Row {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail_url: string | null;
  duration_days: number | null;
  created_at: string;
  joined: number;
}

export default function BusinessChallengesPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const { t } = useLocale();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login?redirectTo=/business/challenges"); return; }

      const bp = await getMyBusinessProfile(supabase);
      if (!bp?.onboarding_done) { router.replace("/business/onboarding"); return; }

      const { data, error } = await supabase
        .from("challenges")
        .select("id,title,description,category,thumbnail_url,duration_days,created_at")
        .eq("creator_id", bp.id)
        .eq("creator_type", "business")
        .order("created_at", { ascending: false });

      if (error) { console.error("[business/challenges]", error.message); setLoading(false); return; }

      const list = (data ?? []) as Omit<Row, "joined">[];
      const ids = list.map((c) => c.id);

      /* One read for every join across every challenge, tallied here. Asking
         for a count per challenge would be N round trips for a number one
         query already contains. */
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

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-28">
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface-container-lowest pt-safe">
        <div className="mx-auto flex measure-wide items-center gap-3 px-5 py-4 lg:px-8">
          <button
            onClick={() => router.back()}
            aria-label={t("mych.back")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-surface-container tap-target"
          >
            <ArrowLeft size={18} className="text-on-surface" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-body-lg font-bold text-on-surface">{t("mych.title")}</h1>
            <p className="truncate text-sm text-on-surface-variant">{t("mych.sub")}</p>
          </div>
          <LanguageToggle className="shrink-0" />
        </div>
      </header>

      <div className="mx-auto measure-wide px-5 py-6 lg:px-8">
        <Link
          href="/business/challenges/new"
          className="mb-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-bold text-white elev-brand transition-opacity hover:opacity-90"
        >
          <Plus size={18} aria-hidden="true" /> {t("action.createChallenge")}
        </Link>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant py-14 text-center">
            <Target size={32} className="text-on-surface-variant" aria-hidden="true" />
            <p className="text-sm font-semibold text-on-surface-variant">{t("mych.emptyTitle")}</p>
            <p className="max-w-xs px-6 text-xs text-on-surface-variant">{t("mych.emptyBody")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/challenges/${c.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 elev-1 surface-raised transition-colors hover:bg-surface-container-low"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-container">
                    {c.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-surface-container-high">
                        <Target size={20} className="text-on-surface-variant opacity-50" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-on-surface">{c.title}</p>
                    {c.description && (
                      <p className="mt-0.5 truncate text-xs text-on-surface-variant">{c.description}</p>
                    )}
                    <span className="mt-1 inline-flex items-center gap-1 text-label-sm font-semibold text-on-surface-variant">
                      <Users size={11} aria-hidden="true" /> {c.joined} {t("mych.joined")}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-xl border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
                    {t("mych.manage")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
