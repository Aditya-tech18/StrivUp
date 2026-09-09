"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { deleteMyAccount } from "@/lib/supabase/profile";

export default function DeleteAccountPage() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === "DELETE";

  const handleDelete = async () => {
    if (!canDelete) return;
    setLoading(true); setError(null);
    try {
      await deleteMyAccount();
      router.replace("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete account. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      <div className="sticky top-0 z-30 flex items-center gap-3 px-5 py-4 bg-white border-b border-outline-variant">
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={20} />
        </button>
        <h1 className="type-headline-sm text-on-surface font-bold">Delete Account</h1>
      </div>

      <div className="max-w-lg mx-auto px-5 py-10 flex flex-col items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
          <Trash2 size={36} className="text-error" />
        </div>

        <div className="text-center">
          <h2 className="text-[22px] font-bold text-on-surface">Delete your account?</h2>
          <p className="type-body-md text-on-surface-variant mt-2 leading-relaxed">
            This will permanently delete your STRIVUP account and all associated data. <span className="font-semibold text-on-surface">This action cannot be undone.</span>
          </p>
        </div>

        {/* Warning */}
        <div className="w-full bg-red-50 border border-red-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-5 h-5 rounded-full bg-error flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">!</span>
            </div>
            <p className="type-body-md font-bold text-error">This will permanently delete:</p>
          </div>
          <ul className="space-y-1.5 ml-7">
            {[
              "Your profile and personal information",
              "All your challenges and progress",
              "Your followers and connections",
              "All uploaded content and data",
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-error mt-0.5 shrink-0">•</span>
                <span className="text-[13px] text-error">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="w-full px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="type-body-md text-error text-center">{error}</p>
          </div>
        )}

        {/* Confirmation input */}
        <div className="w-full">
          <p className="type-body-md text-on-surface mb-2">
            Type <span className="font-bold text-error">DELETE</span> to confirm
          </p>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full h-12 rounded-xl border border-outline-variant bg-white px-4 text-[15px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-error/30 focus:border-error font-mono"
          />
        </div>

        <div className="w-full flex flex-col gap-3">
          <button onClick={handleDelete} disabled={!canDelete || loading}
            className="w-full h-12 rounded-xl bg-error text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Deleting…</> : "Delete Account"}
          </button>
          <button onClick={() => router.back()}
            className="w-full h-12 rounded-xl border border-outline-variant text-on-surface font-semibold text-[15px] hover:bg-surface-container transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
