"use client";
/**
 * /business/onboarding — 7-step resumable business onboarding.
 * Saves progress to Supabase after each step so it can be resumed.
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronLeft, ChevronRight, Globe, MapPin, Phone, Store, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { getMyBusinessProfile, upsertBusinessProfile, uploadBusinessLogo, BUSINESS_CATEGORIES } from "@/lib/data/business";

const TOTAL = 7;
const LABELS = ["Basics","Category","Contact","Location","Logo","Social Links","Review"];

/* ── Step shell ──────────────────────────────────────────────────────────── */
function StepShell({ step, title, subtitle, children, onBack, onNext, nextLabel = "Continue", nextDisabled = false, saving = false }: {
  step: number; title: string; subtitle?: string; children: React.ReactNode;
  onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; saving?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col">
      {/* Progress bar */}
      <div className="h-1 bg-gray-200 w-full">
        <div className="h-1 bg-blue-600 transition-all duration-500" style={{ width: `${(step/TOTAL)*100}%` }} />
      </div>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100">
        {onBack && (
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center" aria-label="Back">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
        )}
        <div className="flex-1">
          <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Step {step} of {TOTAL} · {LABELS[step-1]}</p>
          <h1 className="text-[20px] font-black text-gray-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-6 pb-32 max-w-lg mx-auto w-full">{children}</div>
      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 py-4 safe-area-bottom">
        <button
          onClick={onNext}
          disabled={nextDisabled || saving}
          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-all"
        >
          {saving ? "Saving…" : <>{nextLabel}{!saving && <ChevronRight size={18} />}</>}
        </button>
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function BusinessOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [step, setStep] = useState(1);

  // Form fields
  const [businessName, setBusinessName] = useState("");
  const [businessUsername, setBusinessUsername] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");
  const [logoUrl, setLogoUrl] = useState<string|null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [socialLinks, setSocialLinks] = useState<{platform:string;url:string}[]>([]);
  const [newPlatform, setNewPlatform] = useState("instagram");
  const [newUrl, setNewUrl] = useState("");

  /* Load existing progress */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (bp?.onboarding_done) { router.replace("/business/dashboard"); return; }
      if (bp) {
        setBusinessName(bp.business_name ?? "");
        setBusinessUsername(bp.business_username ?? "");
        setDescription(bp.description ?? "");
        setCategory(bp.category ?? "");
        setBusinessPhone(bp.business_phone ?? "");
        setBusinessEmail(bp.business_email ?? "");
        setWebsite(bp.website ?? "");
        setAddress(bp.address ?? "");
        setCity(bp.city ?? "");
        setStateName(bp.state ?? "");
        setPincode(bp.pincode ?? "");
        setCountry(bp.country ?? "India");
        setLogoUrl(bp.logo_url ?? null);
        setStep(Math.max(1, Math.min(bp.onboarding_step, TOTAL)));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (fields: Record<string, unknown>, nextStep: number) => {
    setSaving(true); setError(null);
    try {
      await upsertBusinessProfile(supabase, { ...fields, onboarding_step: nextStep, verification_status: "incomplete" } as Parameters<typeof upsertBusinessProfile>[1]);
      setStep(nextStep);
    } catch(e) { setError(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  }, [supabase]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]">
      <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
    </div>
  );

  /* ── STEP 1: Basics ───────────────────────────────────────────────────── */
  if (step === 1) return (
    <StepShell step={1} title="Tell us about your business" subtitle="Start with the basics — you can edit these anytime."
      onNext={() => { if (!businessName.trim()) { setError("Business name is required."); return; } save({ business_name: businessName.trim(), business_username: businessUsername.trim() || null, description: description.trim() || null }, 2); }}
      nextDisabled={!businessName.trim()} saving={saving}>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center mb-2">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Store size={32} className="text-blue-600" />
          </div>
        </div>
        <Input label="Business Name *" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. The Brew House" maxLength={80} />
        <Input label="Business Handle" value={businessUsername} onChange={e => setBusinessUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g,""))} placeholder="@thebrewhouse" maxLength={30} hint="Optional · lowercase only" />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-gray-700">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={300} rows={3}
            placeholder="What does your business do? What makes it special?"
            className="w-full rounded-xl border border-gray-200 bg-white text-gray-900 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-100 resize-none" />
          <p className="text-xs text-gray-400 text-right">{description.length}/300</p>
        </div>
      </div>
    </StepShell>
  );

  /* ── STEP 2: Category ─────────────────────────────────────────────────── */
  if (step === 2) return (
    <StepShell step={2} title="What type of business?" subtitle="Choose the category that best describes you."
      onBack={() => setStep(1)} onNext={() => { if (!category) { setError("Please select a category."); return; } save({ category }, 3); }}
      nextDisabled={!category} saving={saving}>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        {BUSINESS_CATEGORIES.map(cat => (
          <button key={cat} type="button" onClick={() => setCategory(cat)}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
              category === cat ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
            }`}>
            {category === cat && <Check size={12} className="inline mr-1" />}{cat}
          </button>
        ))}
      </div>
    </StepShell>
  );

  /* ── STEP 3: Contact ──────────────────────────────────────────────────── */
  if (step === 3) return (
    <StepShell step={3} title="Contact details" subtitle="How can customers reach you?"
      onBack={() => setStep(2)} onNext={() => save({ business_phone: businessPhone.trim()||null, business_email: businessEmail.trim()||null, website: website.trim()||null }, 4)} saving={saving}>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <div className="flex flex-col gap-4">
        <Input label="Business Phone" type="tel" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="+91 98765 43210" hint="Optional" leadingIcon={<Phone size={16} />} />
        <Input label="Business Email" type="email" value={businessEmail} onChange={e => setBusinessEmail(e.target.value)} placeholder="hello@yourbusiness.com" hint="Optional" />
        <Input label="Website" type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourbusiness.com" hint="Optional" leadingIcon={<Globe size={16} />} />
      </div>
    </StepShell>
  );

  /* ── STEP 4: Location ─────────────────────────────────────────────────── */
  if (step === 4) return (
    <StepShell step={4} title="Where are you located?" subtitle="Help customers find you on STRIVUP."
      onBack={() => setStep(3)} onNext={() => save({ address: address.trim()||null, city: city.trim()||null, state: stateName.trim()||null, pincode: pincode.trim()||null, country: country||"India" }, 5)} saving={saving}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-blue-600 mb-1">
          <MapPin size={18} /> <span className="text-sm font-semibold">Business Address</span>
        </div>
        <Input label="Street Address" value={address} onChange={e => setAddress(e.target.value)} placeholder="123, MG Road" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="City" value={city} onChange={e => setCity(e.target.value)} placeholder="Mumbai" />
          <Input label="State" value={stateName} onChange={e => setStateName(e.target.value)} placeholder="Maharashtra" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Pincode" value={pincode} onChange={e => setPincode(e.target.value)} placeholder="400001" maxLength={10} />
          <Input label="Country" value={country} onChange={e => setCountry(e.target.value)} placeholder="India" />
        </div>
      </div>
    </StepShell>
  );

  /* ── STEP 5: Logo ─────────────────────────────────────────────────────── */
  if (step === 5) return (
    <StepShell step={5} title="Add your business logo" subtitle="A logo makes your profile stand out."
      onBack={() => setStep(4)} onNext={() => save({ logo_url: logoUrl }, 6)} nextLabel={logoUrl ? "Continue" : "Skip for now"} saving={saving}>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <div className="flex flex-col items-center gap-6 py-4">
        <label className="relative cursor-pointer group">
          <div className="w-32 h-32 rounded-2xl bg-gray-100 border-2 border-dashed border-gray-300 group-hover:border-blue-500 overflow-hidden flex items-center justify-center transition-colors">
            {logoUploading ? (
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Camera size={32} />
                <span className="text-sm">Upload Logo</span>
              </div>
            )}
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
            onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return;
              setLogoUploading(true);
              try {
                const url = await uploadBusinessLogo(supabase, file);
                setLogoUrl(url);
                await upsertBusinessProfile(supabase, { logo_url: url });
              } catch(err) { setError(err instanceof Error ? err.message : "Upload failed"); }
              finally { setLogoUploading(false); }
            }} />
        </label>
        {logoUrl && <button type="button" onClick={() => setLogoUrl(null)} className="text-sm text-red-500">Remove logo</button>}
        <p className="text-sm text-gray-400 text-center max-w-xs">Square image recommended, min 200×200px. JPG, PNG, or WebP.</p>
      </div>
    </StepShell>
  );

  /* ── STEP 6: Social Links ─────────────────────────────────────────────── */
  if (step === 6) return (
    <StepShell step={6} title="Social links" subtitle="Add your social profiles (optional, max 4)."
      onBack={() => setStep(5)} onNext={() => save({}, 7)} saving={saving}>
      <div className="flex flex-col gap-3">
        {socialLinks.map((link, i) => (
          <div key={i} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-200">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-700 capitalize">{link.platform}</p>
              <p className="text-xs text-gray-400 truncate">{link.url}</p>
            </div>
            <button type="button" onClick={() => setSocialLinks(p => p.filter((_,j) => j !== i))} className="text-red-500 shrink-0">
              <X size={16} />
            </button>
          </div>
        ))}
        {socialLinks.length < 4 && (
          <div className="flex flex-col gap-2 mt-1">
            <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)}
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700">
              {["instagram","linkedin","twitter","youtube","portfolio","other"].map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://…"
                className="flex-1 h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:border-blue-500" />
              <button type="button" onClick={() => { if (!newUrl.trim()) return; setSocialLinks(p => [...p, { platform: newPlatform, url: newUrl.trim() }]); setNewUrl(""); }}
                className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold">
                Add
              </button>
            </div>
          </div>
        )}
        {socialLinks.length >= 4 && <p className="text-sm text-gray-400">Maximum 4 social links.</p>}
      </div>
    </StepShell>
  );

  /* ── STEP 7: Review & Submit ──────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col">
      <div className="h-1 bg-blue-600 w-full" />
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100">
        <button onClick={() => setStep(6)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Step 7 of 7 · Review</p>
          <h1 className="text-[20px] font-black text-gray-900">Review & Submit</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 pb-36 max-w-lg mx-auto w-full">
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {/* Profile preview */}
        <div className="flex flex-col items-center gap-3 mb-6">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" className="w-20 h-20 rounded-2xl object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Store size={28} className="text-blue-600" />
            </div>
          )}
          <div className="text-center">
            <h2 className="text-xl font-black text-gray-900">{businessName || "—"}</h2>
            {businessUsername && <p className="text-sm text-gray-500">@{businessUsername}</p>}
            {category && (
              <span className="inline-block mt-1 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">{category}</span>
            )}
          </div>
        </div>

        {/* Detail rows */}
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
          {[
            { label: "Description", value: description },
            { label: "Phone", value: businessPhone },
            { label: "Email", value: businessEmail },
            { label: "Website", value: website },
            { label: "Location", value: [address, city, stateName, pincode, country].filter(Boolean).join(", ") },
          ].filter(r => r.value).map(row => (
            <div key={row.label} className="flex gap-3 px-4 py-3">
              <span className="text-sm text-gray-400 w-24 shrink-0">{row.label}</span>
              <span className="text-sm text-gray-800 flex-1 break-words">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 bg-blue-50 rounded-2xl px-4 py-3 border border-blue-100">
          <p className="text-sm text-blue-700 text-center">Your business profile will be submitted for review. Verification usually takes 24–48 hours.</p>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 py-4 flex flex-col gap-2">
        <button onClick={async () => {
          setSaving(true); setError(null);
          try {
            await upsertBusinessProfile(supabase, { onboarding_step: 7, onboarding_done: true, verification_status: "submitted" });
            router.push("/business/dashboard");
          } catch(e) { setError(e instanceof Error ? e.message : "Failed"); setSaving(false); }
        }} disabled={saving}
          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-[15px] transition-all">
          {saving ? "Submitting…" : "Submit Business Profile"}
        </button>
        <button onClick={() => setStep(1)} className="w-full h-10 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">
          Edit Details
        </button>
      </div>
    </div>
  );
}
