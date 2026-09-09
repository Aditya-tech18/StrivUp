"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAllInterests, getMyInterestIds, setMyInterests, type Interest, PROFILE_CONSTANTS } from "@/lib/supabase/profile";

export default function InterestsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);
  const [allInterests, setAllInterests] = useState<Interest[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch]     = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const [interests, myIds] = await Promise.all([getAllInterests(), getMyInterestIds()]);
      setAllInterests(interests);
      setSelected(myIds);
      setLoading(false);
    })();
  }, [supabase, router]);

  const toggle = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (selected.length < PROFILE_CONSTANTS.MIN_INTERESTS) {
      setError(`Please select at least ${PROFILE_CONSTANTS.MIN_INTERESTS} interests.`);
      return;
    }
    setSaving(true); setError(null);
    try {
      await setMyInterests(selected);
      setSuccess(true);
      setTimeout(() => { setSuccess(false); router.push("/settings"); }, 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save. Try again."); }
    finally { setSaving(false); }
  };

  const filtered = allInterests.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-7 h-7 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-32 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-5 py-4 bg-white border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
            <ArrowLeft size={20} />
          </button>
          <h1 className="type-headline-sm text-on-surface font-bold">Interests</h1>
        </div>
        <button onClick={handleSave} disabled={saving || selected.length < PROFILE_CONSTANTS.MIN_INTERESTS}
          className="flex items-center gap-1.5 text-secondary font-semibold text-[14px] disabled:opacity-40">
          {saving ? <Loader2 size={15} className="animate-spin" /> : success ? <Check size={15} /> : null}
          {saving ? "Saving…" : success ? "Saved!" : "Save"}
        </button>
      </div>

      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-4 flex-1">
        {/* Header text */}
        <div>
          <h2 className="text-[20px] font-bold text-on-surface leading-tight">Choose Your Interests</h2>
          <p className="type-body-md text-on-surface-variant mt-1">
            Select at least {PROFILE_CONSTANTS.MIN_INTERESTS} interests to get personalized challenge and quest recommendations.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search interests…"
            className="w-full h-11 rounded-xl border border-outline-variant bg-white pl-9 pr-4 text-[14px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="type-body-md text-error">{error}</p>
          </div>
        )}

        {/* Chips */}
        <div className="flex flex-wrap gap-2">
          {filtered.map(interest => {
            const isSelected = selected.includes(interest.id);
            return (
              <button key={interest.id} onClick={() => toggle(interest.id)}
                className={[
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium border transition-all",
                  isSelected
                    ? "bg-secondary text-white border-secondary"
                    : "bg-white text-on-surface border-outline-variant hover:border-secondary/50",
                ].join(" ")}>
                {interest.name}
                {isSelected && <Check size={13} className="text-white" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>

        {/* Why this matters card */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 items-start">
          <span className="text-xl shrink-0">✨</span>
          <div>
            <p className="type-body-md font-semibold text-secondary">Why does this matter?</p>
            <p className="text-[12px] text-on-surface-variant mt-0.5 leading-relaxed">
              Your interests help STRIVUP recommend challenges and quests that are relevant to you. The more accurately you select, the better your experience.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-outline-variant px-5 py-4 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <p className="type-body-md text-on-surface-variant">
            {selected.length} {selected.length === 1 ? "interest" : "interests"} selected
            {selected.length < PROFILE_CONSTANTS.MIN_INTERESTS && (
              <span className="text-error"> (min {PROFILE_CONSTANTS.MIN_INTERESTS})</span>
            )}
          </p>
        </div>
        <button onClick={handleSave} disabled={saving || selected.length < PROFILE_CONSTANTS.MIN_INTERESTS}
          className="w-full h-12 rounded-xl bg-secondary text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : "Save Interests"}
        </button>
      </div>
    </div>
  );
}
