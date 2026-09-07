"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card } from "@/components/ui";
import {
  getMyBusinessProfile,
  upsertBusinessProfile,
  uploadBusinessLogo,
  BUSINESS_CATEGORIES,
  type BusinessProfile,
} from "@/lib/data/business";

export default function BusinessSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const bp = await getMyBusinessProfile(supabase);
      if (!bp) { router.replace("/business/onboarding"); return; }
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
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleSave = async () => {
    if (!businessName.trim()) { setError("Business name is required."); return; }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await upsertBusinessProfile(supabase, {
        business_name: businessName.trim(),
        business_username: businessUsername.trim() || null,
        description: description.trim() || null,
        category: category || null,
        business_phone: businessPhone.trim() || null,
        business_email: businessEmail.trim() || null,
        website: website.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
        country: country.trim() || "India",
        logo_url: logoUrl,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface pb-28">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant bg-surface-container-lowest">
        <Link href="/business/dashboard" className="text-on-surface-variant hover:text-on-surface transition-colors">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="type-headline-sm text-on-surface flex-1">Business Settings</h1>
      </div>

      <div className="px-5 py-6 max-w-lg mx-auto flex flex-col gap-5">
        {error && <p className="type-body-md text-error" role="alert">{error}</p>}
        {success && <p className="type-body-md text-on-tertiary-container" role="status">✓ Changes saved successfully.</p>}

        {/* Logo */}
        <Card bordered padding="lg" className="flex flex-col items-center gap-3">
          <p className="type-label-caps text-on-surface-variant self-start">Business Logo</p>
          <label className="relative cursor-pointer group">
            <div className="w-24 h-24 rounded-2xl bg-surface-container border-2 border-dashed border-outline-variant group-hover:border-secondary overflow-hidden flex items-center justify-center transition-colors">
              {logoUploading
                ? <div className="w-6 h-6 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
                : logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
                  : <Camera size={28} className="text-on-surface-variant" />
              }
            </div>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleLogoUpload} />
          </label>
          {logoUrl && (
            <button type="button" onClick={() => setLogoUrl(null)} className="type-body-md text-error">Remove logo</button>
          )}
        </Card>

        {/* Basics */}
        <Card bordered padding="lg" className="flex flex-col gap-4">
          <p className="type-label-caps text-on-surface-variant">Business Information</p>
          <Input label="Business Name" value={businessName} onChange={e => setBusinessName(e.target.value)} maxLength={80} />
          <Input label="Username" value={businessUsername} onChange={e => setBusinessUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} maxLength={30} hint="Optional · lowercase only" />
          <div className="flex flex-col gap-1">
            <label className="type-body-md font-medium text-on-surface">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={300} rows={3}
              className="w-full rounded border border-outline-variant bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant text-[length:var(--font-size-body-lg)] leading-6 px-3 py-2.5 focus:outline-none focus:ring-2 focus:border-secondary focus:ring-secondary/20 transition-colors" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="type-body-md font-medium text-on-surface">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="h-10 rounded border border-outline-variant bg-surface-container-lowest px-3 type-body-lg text-on-surface focus:outline-none focus:ring-2 focus:border-secondary focus:ring-secondary/20">
              <option value="">Select category…</option>
              {BUSINESS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </Card>

        {/* Contact */}
        <Card bordered padding="lg" className="flex flex-col gap-4">
          <p className="type-label-caps text-on-surface-variant">Contact</p>
          <Input label="Phone" type="tel" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} />
          <Input label="Email" type="email" value={businessEmail} onChange={e => setBusinessEmail(e.target.value)} />
          <Input label="Website" type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://…" />
        </Card>

        {/* Location */}
        <Card bordered padding="lg" className="flex flex-col gap-4">
          <p className="type-label-caps text-on-surface-variant">Location</p>
          <Input label="Address" value={address} onChange={e => setAddress(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" value={city} onChange={e => setCity(e.target.value)} />
            <Input label="State" value={state} onChange={e => setState(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pincode" value={pincode} onChange={e => setPincode(e.target.value)} maxLength={10} />
            <Input label="Country" value={country} onChange={e => setCountry(e.target.value)} />
          </div>
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-surface border-t border-outline-variant">
        <Button variant="primary" size="lg" fullWidth onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
