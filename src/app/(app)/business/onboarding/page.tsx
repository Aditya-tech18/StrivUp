"use client";

/**
 * /business/onboarding — Multi-step business onboarding.
 * Steps:
 *   1. Basics        (name, username, description)
 *   2. Category      (pick from list)
 *   3. Contact       (phone, email, website)
 *   4. Location      (address, city, state, pincode, country)
 *   5. Logo          (upload or skip)
 *   6. Social Links  (optional, max 4)
 *   7. Review        (confirm and submit)
 *
 * Onboarding is resumable: we load onboarding_step from the DB and
 * jump to the right step on mount.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronLeft, ChevronRight, Globe, Link as LinkIcon, MapPin, Phone, Store, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card, Badge } from "@/components/ui";
import {
  getMyBusinessProfile,
  upsertBusinessProfile,
  uploadBusinessLogo,
  BUSINESS_CATEGORIES,
  type BusinessProfile,
} from "@/lib/data/business";

const TOTAL_STEPS = 7;

const STEP_LABELS = [
  "Basics",
  "Category",
  "Contact",
  "Location",
  "Logo",
  "Social Links",
  "Review",
];

/* ── Reusable step wrapper ─────────────────────────────────────────────── */
function StepShell({
  step, title, subtitle, children, onBack, onNext, nextLabel = "Continue", nextDisabled = false, loading = false,
}: {
  step: number; title: string; subtitle?: string; children: React.ReactNode;
  onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; loading?: boolean;
}) {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-surface-container-high">
        <div
          className="h-1 bg-secondary transition-all duration-300"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant bg-surface-container-lowest">
        {onBack && (
          <button onClick={onBack} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Back">
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="flex-1">
          <p className="type-body-md text-on-surface-variant">
            Step {step} of {TOTAL_STEPS} · {STEP_LABELS[step - 1]}
          </p>
          <h1 className="type-headline-sm text-on-surface leading-tight">{title}</h1>
          {subtitle && <p className="type-body-md text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-6 pb-28">
        {children}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-surface border-t border-outline-variant">
        <Button variant="primary" size="lg" fullWidth onClick={onNext} disabled={nextDisabled || loading}>
          {loading ? "Saving…" : nextLabel}
          {!loading && <ChevronRight size={18} />}
        </Button>
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────── */
export default function BusinessOnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  // Form state — mirrors BusinessProfile fields
  const [businessName, setBusinessName] = useState("");
  const [businessUsername, setBusinessUsername] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>([]);
  const [newLinkPlatform, setNewLinkPlatform] = useState("instagram");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  // Load existing business profile and resume from last step
  useEffect(() => {
    (async () => {
      try {
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
          setState(bp.state ?? "");
          setPincode(bp.pincode ?? "");
          setCountry(bp.country ?? "India");
          setLogoUrl(bp.logo_url ?? null);
          // Resume from last step
          setStep(Math.max(1, Math.min(bp.onboarding_step, TOTAL_STEPS)));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (fields: Parameters<typeof upsertBusinessProfile>[1], nextStep: number) => {
    setSaving(true);
    setError(null);
    try {
      await upsertBusinessProfile(supabase, {
        ...fields,
        onboarding_step: nextStep,
        verification_status: "incomplete",
      });
      setStep(nextStep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [supabase]);

  // Step handlers
  const handleStep1 = () => {
    if (!businessName.trim()) { setError("Business name is required."); return; }
    save({ business_name: businessName.trim(), business_username: businessUsername.trim() || null, description: description.trim() || null }, 2);
  };

  const handleStep2 = () => {
    if (!category) { setError("Please select a category."); return; }
    save({ category }, 3);
  };

  const handleStep3 = () => {
    save({ business_phone: businessPhone.trim() || null, business_email: businessEmail.trim() || null, website: website.trim() || null }, 4);
  };

  const handleStep4 = () => {
    save({ address: address.trim() || null, city: city.trim() || null, state: state.trim() || null, pincode: pincode.trim() || null, country: country.trim() || "India" }, 5);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const url = await uploadBusinessLogo(supabase, file);
      setLogoUrl(url);
      await upsertBusinessProfile(supabase, { logo_url: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleStep5 = () => save({ logo_url: logoUrl }, 6);

  const handleAddLink = () => {
    if (!newLinkUrl.trim()) return;
    if (socialLinks.length >= 4) return;
    setSocialLinks(prev => [...prev, { platform: newLinkPlatform, url: newLinkUrl.trim() }]);
    setNewLinkUrl("");
  };

  const handleStep6 = () => save({}, 7);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await upsertBusinessProfile(supabase, {
        onboarding_step: 7,
        onboarding_done: true,
        verification_status: "submitted",
      });
      router.push("/business/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
          <p className="type-body-md text-on-surface-variant">Loading your business profile…</p>
        </div>
      </div>
    );
  }

  /* ── Step renders ─────────────────────────────────────────────────────── */

  // STEP 1: Basics
  if (step === 1) return (
    <StepShell step={1} title="Tell us about your business" subtitle="Start with the basics — you can edit these later."
      onNext={handleStep1} nextDisabled={!businessName.trim()} loading={saving}>
      {error && <p className="type-body-md text-error mb-4">{error}</p>}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center mb-2">
          <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center">
            <Store size={32} className="text-secondary" />
          </div>
        </div>
        <Input label="Business Name" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. The Brew House" maxLength={80} />
        <Input label="Business Username" value={businessUsername} onChange={e => setBusinessUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} placeholder="e.g. thebrewhouse" maxLength={30} hint="Optional · lowercase only" />
        <div className="flex flex-col gap-1">
          <label className="type-body-md font-medium text-on-surface">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does your business do? What makes it special?"
            maxLength={300}
            rows={4}
            className="w-full rounded border border-outline-variant bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant text-[length:var(--font-size-body-lg)] leading-6 px-3 py-2.5 focus:outline-none focus:ring-2 focus:border-secondary focus:ring-secondary/20 transition-colors"
          />
          <p className="type-body-md text-on-surface-variant">{description.length}/300</p>
        </div>
      </div>
    </StepShell>
  );

  // STEP 2: Category
  if (step === 2) return (
    <StepShell step={2} title="What type of business?" subtitle="Choose the category that best describes you."
      onBack={() => setStep(1)} onNext={handleStep2} nextDisabled={!category} loading={saving}>
      {error && <p className="type-body-md text-error mb-4">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        {BUSINESS_CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={[
              "rounded-xl border px-4 py-3 text-left transition-all duration-150",
              "type-body-md font-medium",
              category === cat
                ? "bg-secondary/10 border-secondary text-secondary"
                : "bg-surface-container-lowest border-outline-variant text-on-surface hover:border-outline",
            ].join(" ")}
          >
            {category === cat && <Check size={14} className="inline mr-1.5 text-secondary" />}
            {cat}
          </button>
        ))}
      </div>
    </StepShell>
  );

  // STEP 3: Contact
  if (step === 3) return (
    <StepShell step={3} title="Business contact details" subtitle="How can customers reach you?"
      onBack={() => setStep(2)} onNext={handleStep3} loading={saving}>
      {error && <p className="type-body-md text-error mb-4">{error}</p>}
      <div className="flex flex-col gap-4">
        <Input label="Business Phone" type="tel" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="+91 98765 43210" hint="Optional" leadingIcon={<Phone size={16} />} />
        <Input label="Business Email" type="email" value={businessEmail} onChange={e => setBusinessEmail(e.target.value)} placeholder="hello@yourbusiness.com" hint="Optional" />
        <Input label="Website" type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourbusiness.com" hint="Optional" leadingIcon={<Globe size={16} />} />
      </div>
    </StepShell>
  );

  // STEP 4: Location
  if (step === 4) return (
    <StepShell step={4} title="Where are you located?" subtitle="Help customers find you on STRIVUP."
      onBack={() => setStep(3)} onNext={handleStep4} loading={saving}>
      {error && <p className="type-body-md text-error mb-4">{error}</p>}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-secondary mb-1">
          <MapPin size={18} />
          <span className="type-body-md font-medium">Business Address</span>
        </div>
        <Input label="Address" value={address} onChange={e => setAddress(e.target.value)} placeholder="123, MG Road" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="City" value={city} onChange={e => setCity(e.target.value)} placeholder="Mumbai" />
          <Input label="State" value={state} onChange={e => setState(e.target.value)} placeholder="Maharashtra" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Pincode" value={pincode} onChange={e => setPincode(e.target.value)} placeholder="400001" maxLength={10} />
          <Input label="Country" value={country} onChange={e => setCountry(e.target.value)} placeholder="India" />
        </div>
      </div>
    </StepShell>
  );

  // STEP 5: Logo
  if (step === 5) return (
    <StepShell step={5} title="Add your business logo" subtitle="A logo makes your profile stand out."
      onBack={() => setStep(4)} onNext={handleStep5} nextLabel={logoUrl ? "Continue" : "Skip for now"} loading={saving}>
      {error && <p className="type-body-md text-error mb-4">{error}</p>}
      <div className="flex flex-col items-center gap-6 py-4">
        <label className="relative cursor-pointer group">
          <div className="w-32 h-32 rounded-2xl bg-surface-container border-2 border-dashed border-outline-variant group-hover:border-secondary overflow-hidden flex items-center justify-center transition-colors">
            {logoUploading ? (
              <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
            ) : logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Business logo" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-on-surface-variant">
                <Camera size={32} />
                <span className="type-body-md">Upload Logo</span>
              </div>
            )}
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleLogoUpload} />
        </label>
        {logoUrl && (
          <button type="button" onClick={() => setLogoUrl(null)} className="type-body-md text-error">Remove logo</button>
        )}
        <p className="type-body-md text-on-surface-variant text-center max-w-xs">
          Recommended: square image, min 200×200px. JPG, PNG, or WebP.
        </p>
      </div>
    </StepShell>
  );

  // STEP 6: Social Links
  if (step === 6) return (
    <StepShell step={6} title="Social links" subtitle="Add your social media profiles (optional)."
      onBack={() => setStep(5)} onNext={handleStep6} loading={saving}>
      {error && <p className="type-body-md text-error mb-4">{error}</p>}
      <div className="flex flex-col gap-4">
        {socialLinks.map((link, i) => (
          <div key={i} className="flex items-center gap-3 bg-surface-container rounded-lg px-4 py-3 border border-outline-variant">
            <LinkIcon size={16} className="text-on-surface-variant shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="type-body-md font-medium text-on-surface capitalize">{link.platform}</p>
              <p className="type-body-md text-on-surface-variant truncate">{link.url}</p>
            </div>
            <button type="button" onClick={() => setSocialLinks(prev => prev.filter((_, j) => j !== i))} className="text-error shrink-0" aria-label="Remove">
              <X size={16} />
            </button>
          </div>
        ))}
        {socialLinks.length < 4 && (
          <div className="flex flex-col gap-2">
            <select value={newLinkPlatform} onChange={e => setNewLinkPlatform(e.target.value)}
              className="h-10 rounded border border-outline-variant bg-surface-container-lowest px-3 type-body-lg text-on-surface">
              {["instagram","linkedin","twitter","youtube","portfolio","other"].map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="https://…" className="flex-1" />
              <Button type="button" variant="outline" onClick={handleAddLink} disabled={!newLinkUrl.trim()}>Add</Button>
            </div>
          </div>
        )}
        {socialLinks.length >= 4 && (
          <p className="type-body-md text-on-surface-variant">Maximum 4 social links.</p>
        )}
      </div>
    </StepShell>
  );

  // STEP 7: Review
  if (step === 7) return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="w-full h-1 bg-secondary" />
      <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant bg-surface-container-lowest">
        <button onClick={() => setStep(6)} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <div>
          <p className="type-body-md text-on-surface-variant">Step 7 of 7 · Review</p>
          <h1 className="type-headline-sm text-on-surface">Review & submit</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 pb-28">
        {error && <p className="type-body-md text-error mb-4">{error}</p>}

        <div className="flex flex-col items-center gap-4 mb-6">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" className="w-20 h-20 rounded-2xl object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-surface-container border border-outline-variant flex items-center justify-center">
              <Store size={28} className="text-on-surface-variant" />
            </div>
          )}
          <div className="text-center">
            <h2 className="type-headline-md text-on-surface">{businessName || "—"}</h2>
            {businessUsername && <p className="type-body-md text-on-surface-variant">@{businessUsername}</p>}
            {category && <Badge variant="secondary" className="mt-1">{category}</Badge>}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {[
            { label: "Description", value: description },
            { label: "Phone", value: businessPhone },
            { label: "Email", value: businessEmail },
            { label: "Website", value: website },
            { label: "City", value: [city, state].filter(Boolean).join(", ") },
            { label: "Country", value: country },
          ].filter(r => r.value).map(row => (
            <div key={row.label} className="flex gap-3 py-2.5 border-b border-outline-variant last:border-0">
              <span className="type-body-md text-on-surface-variant w-24 shrink-0">{row.label}</span>
              <span className="type-body-md text-on-surface flex-1">{row.value}</span>
            </div>
          ))}
        </div>

        <Card bordered padding="md" className="mt-5 bg-surface-container">
          <p className="type-body-md text-on-surface-variant text-center">
            Your business profile will be submitted for review. Verification usually takes 24–48 hours.
          </p>
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-surface border-t border-outline-variant flex flex-col gap-2">
        <Button variant="primary" size="lg" fullWidth onClick={handleSubmit} disabled={saving}>
          {saving ? "Submitting…" : "Submit Business Profile"}
        </Button>
        <Button variant="outline" size="md" fullWidth onClick={() => setStep(1)}>
          Edit details
        </Button>
      </div>
    </div>
  );

  return null;
}
