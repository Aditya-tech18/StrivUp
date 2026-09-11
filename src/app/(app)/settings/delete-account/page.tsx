"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { deleteMyAccount } from "@/lib/supabase/profile";

export default function DeleteAccountPage() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

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
    <div className="min-h-screen bg-[#F5F5F7] pb-28">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-5 py-3.5">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors">
            <ArrowLeft size={19} className="text-on-surface" />
          </button>
          <h1 className="text-[17px] font-bold text-on-surface tracking-[-0.01em]">Delete Account</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-10 flex flex-col items-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center shadow-[0_4px_20px_rgba(186,26,26,0.12)]">
          <Trash2 size={36} className="text-error" strokeWidth={1.5} />
        </div>

        <div className="text-center max-w-xs">
          <h2 className="text-[22px] font-bold text-on-surface tracking-[-0.02em]">Delete your account?</h2>
          <p className="text-[14px] text-on-surface-variant mt-2 leading-relaxed">
            This permanently deletes your account and all associated data.{" "}
            <span className="font-semibold text-on-surface">This cannot be undone.</span>
          </p>
        </div>

        <div className="w-full bg-red-50 border border-red-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-4 h-4 rounded-full bg-error flex items-center justify-center shrink-0">
              <span className="text-white text-[9px] font-black">!</span>
            </div>
            <p className="text-[13px] font-bold text-error">This will permanently remove:</p>
          </div>
          <ul className="space-y-1.5 pl-1">
            {[
              "Your profile and personal information",
              "All your challenges and progress",
              "Your followers and connections",
              "All uploaded content and activity",
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-error mt-2 shrink-0" />
                <span className="text-[13px] text-error">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="w-full px-4 py-3 rounded-xl bg-error-container border border-error/20">
            <p className="text-[13px] text-error text-center">{error}</p>
          </div>
        )}

        <div className="w-full flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-on-surface">
            Type <span className="font-black text-error tracking-wide">DELETE</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            spellCheck={false}
            className="w-full h-12 rounded-xl border border-outline-variant bg-white px-4 text-[15px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-error/25 focus:border-error font-mono transition-colors"
          />
        </div>

        <div className="w-full flex flex-col gap-3">
          <button onClick={handleDelete} disabled={!canDelete || loading}
            className="w-full h-12 rounded-xl bg-error text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity shadow-[0_2px_8px_rgba(186,26,26,0.25)]">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Deleting…</> : "Delete Account"}
          </button>
          <button onClick={() => router.back()}
            className="w-full h-12 rounded-xl border border-outline-variant text-on-surface font-semibold text-[15px] hover:bg-surface-container-low transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
