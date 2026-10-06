"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Loader2, Mail, Phone, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyProfile, getMyProfilePrivate, upsertMyProfilePrivate, type Profile, type ProfilePrivate } from "@/lib/supabase/profile";

const GENDERS = [
  { value: "male",              label: "Male"            },
  { value: "female",            label: "Female"          },
  { value: "non_binary",        label: "Non-binary"      },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

function InfoRow({ label, value, chip }: { label: string; value: string; chip?: { text: string; ok: boolean } }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant last:border-0">
      <p className="text-body-md text-on-surface-variant">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-body-md font-medium text-on-surface">{value}</p>
        {chip && (
          <span className={[
            "text-label-sm font-semibold px-2 py-0.5 rounded-full",
            chip.ok ? "bg-success-container text-on-success-container" : "bg-warning-container text-on-warning-container",
          ].join(" ")}>
            {chip.text}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AccountDetailsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile,       setProfile]       = useState<Profile | null>(null);
  const [priv,          setPriv]          = useState<ProfilePrivate | null>(null);
  const [authEmail,     setAuthEmail]     = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [success,       setSuccess]       = useState(false);
  const [age,           setAge]           = useState("");
  const [gender,        setGender]        = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }
        setAuthEmail(user.email ?? null);
        setEmailVerified(!!user.email_confirmed_at);
        const [p, pr] = await Promise.all([getMyProfile(), getMyProfilePrivate()]);
        setProfile(p); setPriv(pr);
        setAge(pr?.age != null ? String(pr.age) : "");
        setGender(pr?.gender ?? "");
      } catch { setError("Failed to load account details"); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const ageNum = age ? Number(age) : null;
      if (ageNum != null && (ageNum < 13 || ageNum > 120))
        throw new Error("Please enter a valid age (13–120)");
      await upsertMyProfilePrivate({ age: ageNum, gender: gender || undefined });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Please try again.");
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  const inputCls = "w-full h-11 rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary/25 focus:border-secondary transition-colors";

  return (
    <div className="min-h-screen bg-surface pb-28">
      <div className="sticky top-0 pt-safe z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant">
        <div className="mx-auto measure-form flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <button aria-label="Back" onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors tap-target">
              <ArrowLeft size={19} className="text-on-surface" />
            </button>
            <h1 className="text-body-lg font-bold text-on-surface tracking-[-0.01em]">Account Details</h1>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="text-body-md font-bold text-secondary disabled:opacity-40 flex items-center gap-1">
            {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <Check size={14} /> : null}
            {saving ? "Saving…" : success ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="mx-auto measure-form px-5 pt-5 flex flex-col gap-5">
        {error && (
          <div role="alert" className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="text-body-md text-error flex-1">{error}</p>
            <button aria-label="Dismiss error" onClick={() => setError(null)}><X size={14} className="text-error" /></button>
          </div>
        )}

        {/* Login Information */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant elev-1 surface-raised overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <p className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-[0.08em]">Login Information</p>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Used to access your account</p>
          </div>
          <div className="divide-y divide-outline-variant">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                <Mail size={15} className="text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-label-sm text-on-surface-variant">Email Address</p>
                <p className="text-body-md font-medium text-on-surface truncate">{authEmail ?? "—"}</p>
              </div>
              <span className={["text-label-sm font-semibold px-2 py-0.5 rounded-full shrink-0", emailVerified ? "bg-success-container text-on-success-container" : "bg-warning-container text-on-warning-container"].join(" ")}>
                {emailVerified ? "Verified" : "Unverified"}
              </span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                <Phone size={15} className="text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-label-sm text-on-surface-variant">Phone Number</p>
                <p className="text-body-md font-medium text-on-surface">{priv?.phone ?? "Not added"}</p>
              </div>
              {priv?.phone && (
                <span className={["text-label-sm font-semibold px-2 py-0.5 rounded-full shrink-0", priv.phone_verified ? "bg-success-container text-on-success-container" : "bg-warning-container text-on-warning-container"].join(" ")}>
                  {priv.phone_verified ? "Verified" : "Unverified"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant elev-1 surface-raised p-4 flex flex-col gap-4">
          <p className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-[0.08em]">Personal Information</p>
          <div className="flex flex-col gap-1.5">
            <label className="text-body-sm font-medium text-on-surface-variant">Age</label>
            <input aria-label="Age" type="number" value={age} onChange={e => setAge(e.target.value)} min={13} max={120} placeholder="Your age" className={inputCls} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-body-sm font-medium text-on-surface-variant">Gender</label>
            <div className="relative">
              <select aria-label="Gender" value={gender} onChange={e => setGender(e.target.value)}
                className={inputCls + " appearance-none pr-9"}>
                <option value="">Select gender</option>
                {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
              <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant rotate-90 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Account Information */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant elev-1 surface-raised overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-label-sm font-semibold text-on-surface-variant uppercase tracking-[0.08em]">Account Information</p>
          </div>
          <InfoRow
            label="Member Since"
            value={profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
              : "—"}
          />
          <InfoRow label="Account Type" value={profile?.account_type ? profile.account_type.charAt(0).toUpperCase() + profile.account_type.slice(1) : "—"} />
          <InfoRow label="Account Status" value={profile?.is_deactivated ? "Deactivated" : "Active"} chip={!profile?.is_deactivated ? { text: "Active", ok: true } : { text: "Deactivated", ok: false }} />
        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={saving}
          className="w-full h-12 rounded-xl bg-secondary text-white text-body-lg font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity elev-2">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
