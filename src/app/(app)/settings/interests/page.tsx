"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAllInterests, getMyInterestIds, setMyInterests, type Interest, PROFILE_CONSTANTS } from "@/lib/supabase/profile";

export default function InterestsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [all,      setAll]      = useState<Interest[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [search,   setSearch]   = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }
        const [interests, myIds] = await Promise.all([getAllInterests(), getMyInterestIds()]);
        setAll(interests);
        setSelected(myIds);
      } catch { setError("Failed to load interests"); }
      finally { setLoading(false); }
    })();
  }, []);

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSave = async () => {
    if (selected.length < PROFILE_CONSTANTS.MIN_INTERESTS) {
      setError(`Please select at least ${PROFILE_CONSTANTS.MIN_INTERESTS} interests`);
      return;
    }
    setSaving(true); setError(null);
    try {
      await setMyInterests(selected);
      setSaved(true);
      setTimeout(() => { setSaved(false); router.push("/settings"); }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Please try again.");
    } finally { setSaving(false); }
  };

  const filtered = all.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <div className="sticky top-0 pt-safe z-40 bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant">
        <div className="mx-auto measure-form flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <button aria-label="Back" onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors tap-target">
              <ArrowLeft size={19} className="text-on-surface" />
            </button>
            <h1 className="text-body-lg font-bold text-on-surface tracking-[-0.01em]">Interests</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || selected.length < PROFILE_CONSTANTS.MIN_INTERESTS}
            className="text-body-md font-bold text-secondary disabled:opacity-40 flex items-center gap-1"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="mx-auto measure-form px-5 pt-5 flex flex-col gap-4 flex-1 pb-36">
        <div>
          <h2 className="text-headline-md font-bold text-on-surface tracking-[-0.02em]">Choose Your Interests</h2>
          <p className="text-body-md text-on-surface-variant mt-1">
            Select at least {PROFILE_CONSTANTS.MIN_INTERESTS} to get personalised recommendations.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input aria-label="Search interests…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search interests…"
            className="w-full h-11 rounded-xl border border-outline-variant bg-surface-container-lowest pl-9 pr-4 text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary transition-colors"
          />
        </div>

        {error && (
          <div role="alert" className="px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="text-body-md text-error">{error}</p>
          </div>
        )}

        {/* Chips */}
        <div className="flex flex-wrap gap-2">
          {filtered.map(interest => {
            const on = selected.includes(interest.id);
            return (
              <button
                key={interest.id}
                onClick={() => toggle(interest.id)}
                className={[
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-body-md font-medium border transition-all",
                  on
                    ? "bg-secondary text-white border-secondary shadow-[0_2px_8px_rgba(29,78,216,0.25)]"
                    : "bg-surface-container-lowest text-on-surface border-outline-variant hover:border-secondary/50 hover:bg-surface-container-low",
                ].join(" ")}
              >
                {interest.name}
                {on && <Check size={12} strokeWidth={2.5} className="text-white" />}
              </button>
            );
          })}
        </div>

        {/* Why card */}
        <div className="bg-secondary-fixed border border-secondary-fixed-dim rounded-2xl p-4">
          <p className="text-body-md font-semibold text-secondary mb-1">Why does this matter?</p>
          <p className="text-body-sm text-on-surface-variant leading-relaxed">
            Your interests power STRIVUP&apos;s recommendation engine — helping us surface challenges and quests that align with your goals, not just what&apos;s popular.
          </p>
        </div>
      </div>

      {/* Bottom save bar */}
      <div className="fixed above-bottom-nav z-40 bg-surface-container-lowest/95 backdrop-blur-md border-t border-outline-variant px-5 py-4">
        <div className="mx-auto measure-form flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-body-md text-on-surface-variant">
              {selected.length} selected
              {selected.length < PROFILE_CONSTANTS.MIN_INTERESTS && (
                <span className="text-error"> · need {PROFILE_CONSTANTS.MIN_INTERESTS - selected.length} more</span>
              )}
            </p>
            {selected.length >= PROFILE_CONSTANTS.MIN_INTERESTS && (
              <span className="text-body-sm font-semibold text-secondary">Ready to save</span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || selected.length < PROFILE_CONSTANTS.MIN_INTERESTS}
            className="w-full h-12 rounded-xl bg-secondary text-white font-bold text-body-lg flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity shadow-[0_2px_8px_rgba(29,78,216,0.25)]"
          >
            {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : "Save Interests"}
          </button>
        </div>
      </div>
    </div>
  );
}
