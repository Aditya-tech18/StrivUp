"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Loader2, Mail, Phone, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyProfile, getMyProfilePrivate, upsertMyProfilePrivate, type Profile, type ProfilePrivate } from "@/lib/supabase/profile";

const GENDERS = [
  { value: "male",             label: "Male" },
  { value: "female",           label: "Female" },
  { value: "non_binary",       label: "Non-binary" },
  { value: "prefer_not_to_say",label: "Prefer not to say" },
];

export default function AccountDetailsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [priv, setPriv]       = useState<ProfilePrivate | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [age, setAge]       = useState("");
  const [gender, setGender] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setAuthEmail(user.email ?? null);
      setEmailVerified(!!user.email_confirmed_at);
      const [p, pr] = await Promise.all([getMyProfile(), getMyProfilePrivate()]);
      setProfile(p);
      setPriv(pr);
      setAge(pr?.age ? String(pr.age) : "");
      setGender(pr?.gender ?? "");
      setLoading(false);
    })();
  }, [supabase, router]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const ageNum = age ? Number(age) : null;
      if (ageNum !== null && (ageNum < 13 || ageNum > 120)) throw new Error("Please enter a valid age (13–120)");
      await upsertMyProfilePrivate({ age: ageNum, gender: gender || undefined });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save. Try again."); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-7 h-7 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      <div className="sticky top-0 z-30 flex items-center justify-between px-5 py-4 bg-white border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
            <ArrowLeft size={20} />
          </button>
          <h1 className="type-headline-sm text-on-surface font-bold">Account Details</h1>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 text-secondary font-semibold text-[14px] disabled:opacity-40">
          {saving ? <Loader2 size={15} className="animate-spin" /> : success ? <Check size={15} /> : null}
          {saving ? "Saving…" : success ? "Saved!" : "Save"}
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-3 px-4 py-3 rounded-xl bg-error-container border border-error/20 flex items-center gap-2">
          <p className="type-body-md text-error flex-1">{error}</p>
          <button onClick={() => setError(null)}><X size={14} className="text-error" /></button>
        </div>
      )}

      <div className="max-w-lg mx-auto px-5 py-5 flex flex-col gap-5">

        {/* Login Information */}
        <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="type-label-caps text-on-surface-variant">Login Information</p>
            <p className="text-[11px] text-on-surface-variant mt-0.5">These details are used to access your account.</p>
          </div>
          <div className="divide-y divide-outline-variant">
            {/* Email */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                <Mail size={16} className="text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-on-surface-variant">Email Address</p>
                <p className="type-body-md text-on-surface font-medium truncate">{authEmail ?? "—"}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${emailVerified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                {emailVerified ? "Verified" : "Unverified"}
              </span>
            </div>
            {/* Phone */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                <Phone size={16} className="text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-on-surface-variant">Phone Number</p>
                <p className="type-body-md text-on-surface font-medium">{priv?.phone ?? "Not added"}</p>
              </div>
              {priv?.phone && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${priv.phone_verified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                  {priv.phone_verified ? "Verified" : "Unverified"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="type-label-caps text-on-surface-variant">Personal Information</p>
          </div>
          <div className="px-4 pb-4 flex flex-col gap-3">
            <div>
              <label className="block text-[12px] font-medium text-on-surface-variant mb-1.5">Age</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)} min={13} max={120} placeholder="Your age"
                className="w-full h-11 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-[14px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-on-surface-variant mb-1.5">Gender</label>
              <div className="relative">
                <select value={gender} onChange={e => setGender(e.target.value)}
                  className="w-full h-11 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 pr-8 text-[14px] text-on-surface appearance-none focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary">
                  <option value="">Select gender</option>
                  {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
                <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant rotate-90 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Account Information */}
        <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="type-label-caps text-on-surface-variant">Account Information</p>
          </div>
          <div className="divide-y divide-outline-variant">
            <InfoRow label="Member Since" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"} />
            <InfoRow label="Account Type" value={profile?.account_type ? (profile.account_type.charAt(0).toUpperCase() + profile.account_type.slice(1)) : "—"} />
            <InfoRow label="Account Status" value={profile?.is_deactivated ? "Deactivated" : "Active"} badge={!profile?.is_deactivated} />
          </div>
        </div>

      </div>
    </div>
  );
}

function InfoRow({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <p className="type-body-md text-on-surface-variant">{label}</p>
      {badge
        ? <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700">{value}</span>
        : <p className="type-body-md font-medium text-on-surface">{value}</p>}
    </div>
  );
}
