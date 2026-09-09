"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui";
import { getMyBusinessProfile, upsertBusinessProfile, uploadBusinessLogo, BUSINESS_CATEGORIES } from "@/lib/data/business";

export default function BusinessSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [success, setSuccess] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

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

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
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
      setStateName(bp.state ?? "");
      setPincode(bp.pincode ?? "");
      setCountry(bp.country ?? "India");
      setLogoUrl(bp.logo_url ?? null);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!businessName.trim()) { setError("Business name is required."); return; }
    setSaving(true); setError(null); setSuccess(false);
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
        state: stateName.trim() || null,
        pincode: pincode.trim() || null,
        country: country || "India",
        logo_url: logoUrl,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch(e) { setError(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FC]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-28">
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 sticky top-0 z-30">
        <Link href="/business/dashboard"><ArrowLeft size={22} className="text-gray-600" /></Link>
        <h1 className="text-[17px] font-black text-gray-900 flex-1">Business Settings</h1>
      </div>

      <div className="px-5 py-5 max-w-lg mx-auto flex flex-col gap-5">
        {error && <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-600">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700">✓ Changes saved successfully.</div>}

        {/* Logo */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center gap-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider self-start">Business Logo</p>
          <label className="relative cursor-pointer group">
            <div className="w-24 h-24 rounded-2xl bg-gray-100 border-2 border-dashed border-gray-300 group-hover:border-blue-500 overflow-hidden flex items-center justify-center transition-colors">
              {logoUploading
                ? <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                // eslint-disable-next-line @next/next/no-img-element
                : logoUrl ? <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
                : <Camera size={28} className="text-gray-400" />
              }
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
        </div>

        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Business Information</p>
          <Input label="Business Name *" value={businessName} onChange={e => setBusinessName(e.target.value)} maxLength={80} />
          <Input label="Username" value={businessUsername} onChange={e => setBusinessUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g,""))} maxLength={30} hint="Optional · lowercase only" />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-gray-700">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={300} rows={3}
              className="w-full rounded-xl border border-gray-200 bg-white text-gray-900 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:border-blue-500 focus:ring-blue-100 resize-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-gray-700">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:border-blue-500">
              <option value="">Select category…</option>
              {BUSINESS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contact</p>
          <Input label="Phone" type="tel" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} />
          <Input label="Email" type="email" value={businessEmail} onChange={e => setBusinessEmail(e.target.value)} />
          <Input label="Website" type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://…" />
        </div>

        {/* Location */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location</p>
          <Input label="Street Address" value={address} onChange={e => setAddress(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" value={city} onChange={e => setCity(e.target.value)} />
            <Input label="State" value={stateName} onChange={e => setStateName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pincode" value={pincode} onChange={e => setPincode(e.target.value)} maxLength={10} />
            <Input label="Country" value={country} onChange={e => setCountry(e.target.value)} />
          </div>
        </div>

        {/* Sign out */}
        <button onClick={handleSignOut}
          className="w-full h-12 rounded-2xl border border-red-200 text-red-600 font-semibold text-sm flex items-center justify-center gap-2 bg-white hover:bg-red-50 transition-colors">
          <LogOut size={16} /> Sign Out
        </button>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 py-4">
        <button onClick={handleSave} disabled={saving}
          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-[15px] transition-all">
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
