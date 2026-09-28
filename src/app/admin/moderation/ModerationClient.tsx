"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Shield, ShieldAlert, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, Button } from "@/components/ui";

interface ProofRow {
  id: string;
  media_url: string | null;
  caption: string | null;
  admin_removed: boolean | null;
  user_id: string;
  challenge_id?: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
  challenges?: { title: string } | null;
}

interface ReportRow {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  proof_id: string;
  proof_submissions?: ProofRow | null;
}

export default function ModerationClient({ 
  moderatorRole, 
  currentUserId 
}: { 
  moderatorRole: string;
  currentUserId: string;
}) {
  const [tab, setTab] = useState<"reports" | "all">("reports");
  const supabase = createClient();

  const canRemove = moderatorRole === "senior_moderator" || moderatorRole === "super_admin";

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [submissions, setSubmissions] = useState<ProofRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [removeProofId, setRemoveProofId] = useState<string | null>(null);
  const [removeReportId, setRemoveReportId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removing, setRemoving] = useState(false);

  // Fetches rows for the current tab; state is applied in applyData so the
  // effect only sets state from a promise callback.
  type Loaded = { reports?: ReportRow[]; submissions?: ProofRow[] };
  const fetchData = async (): Promise<Loaded> => {
    if (tab === "reports") {
      const { data, error } = await supabase
        .from("proof_reports")
        .select(`
          id,
          reason,
          status,
          created_at,
          proof_id,
          proof_submissions (
            id,
            media_url,
            caption,
            admin_removed,
            user_id,
            challenge_id,
            profiles ( full_name, avatar_url ),
            challenges ( title )
          )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
        
      if (!error && data) {
        return { reports: (data as unknown as ReportRow[]).filter(r => !r.proof_submissions?.admin_removed) };
      }
    } else {
      const { data, error } = await supabase
        .from("proof_submissions")
        .select(`
          id,
          media_url,
          caption,
          admin_removed,
          user_id,
          profiles ( full_name, avatar_url ),
          challenges ( title )
        `)
        .order("submitted_at", { ascending: false })
        .limit(50);
        
      if (!error && data) {
        return { submissions: data as unknown as ProofRow[] };
      }
    }
    return {};
  };

  const applyData = (loaded: Loaded) => {
    if (loaded.reports) setReports(loaded.reports);
    if (loaded.submissions) setSubmissions(loaded.submissions);
    setLoading(false);
  };

  const selectTab = (next: "reports" | "all") => {
    if (next === tab) return;
    setLoading(true);
    setTab(next);
  };

  useEffect(() => {
    fetchData().then(applyData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleDismiss = async (reportId: string) => {
    await supabase.from("proof_reports").update({ status: "reviewed" }).eq("id", reportId);
    setReports(prev => prev.filter(r => r.id !== reportId));
  };

  const handleRemove = async () => {
    if (!removeProofId || !removeReason) return;
    setRemoving(true);
    
    // Update proof_submissions
    await supabase.from("proof_submissions").update({
      admin_removed: true,
      admin_removal_reason: removeReason,
      admin_removed_by: currentUserId,
      admin_removed_at: new Date().toISOString()
    }).eq("id", removeProofId);

    // If removing from reports tab, update report status
    if (removeReportId) {
      await supabase.from("proof_reports").update({ status: "reviewed" }).eq("id", removeReportId);
    }

    setRemoveProofId(null);
    setRemoveReportId(null);
    setRemoveReason("");
    setRemoving(false);
    setLoading(true);
    applyData(await fetchData());
  };

  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="type-headline-md text-on-surface flex items-center gap-2">
            <Shield className="text-secondary" /> Moderation Dashboard
          </h1>
          <p className="type-body-md text-on-surface-variant mt-1">
            Role: <span className="font-semibold text-secondary">{moderatorRole}</span>
          </p>
        </div>

        <div className="flex gap-2 border-b border-outline-variant">
          <button 
            className={`px-4 py-2 type-body-md font-medium border-b-2 ${tab === "reports" ? "border-secondary text-secondary" : "border-transparent text-on-surface-variant"}`}
            onClick={() => selectTab("reports")}
          >
            Pending Reports
          </button>
          <button 
            className={`px-4 py-2 type-body-md font-medium border-b-2 ${tab === "all" ? "border-secondary text-secondary" : "border-transparent text-on-surface-variant"}`}
            onClick={() => selectTab("all")}
          >
            All Proof
          </button>
        </div>

        {loading ? (
          <p className="type-body-md text-on-surface-variant">Loading...</p>
        ) : tab === "reports" ? (
          <div className="space-y-4">
            {reports.length === 0 ? (
              <p className="type-body-md text-on-surface-variant">No pending reports.</p>
            ) : (
              reports.map(report => (
                <Card key={report.id} bordered padding="md" className="flex gap-4">
                  <div className="w-32 h-32 relative bg-surface-variant rounded-lg overflow-hidden flex-shrink-0">
                    <Image 
                      src={report.proof_submissions?.media_url || ""} 
                      alt="Proof" 
                      fill 
                      className="object-cover" 
                      unoptimized
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="type-label-caps text-error">Report Reason: {report.reason}</p>
                    <p className="type-body-sm text-on-surface">
                      <strong>Submitter:</strong> {report.proof_submissions?.profiles?.full_name || "Unknown"}
                    </p>
                    <p className="type-body-sm text-on-surface">
                      <strong>Challenge:</strong> {report.proof_submissions?.challenges?.title || "Unknown"}
                    </p>
                    <p className="type-body-sm text-on-surface">
                      <strong>Caption:</strong> {report.proof_submissions?.caption}
                    </p>
                    
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" onClick={() => handleDismiss(report.id)}>
                        <Check size={16} className="mr-1" /> Dismiss
                      </Button>
                      {canRemove && (
                        <Button 
                          variant="outline" 
                          className="border-error text-error hover:bg-error/10"
                          onClick={() => {
                            setRemoveProofId(report.proof_id);
                            setRemoveReportId(report.id);
                          }}
                        >
                          <X size={16} className="mr-1" /> Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {submissions.map(sub => (
              <Card key={sub.id} bordered padding="md" className="space-y-3">
                <div className="w-full aspect-video relative bg-surface-variant rounded-lg overflow-hidden flex items-center justify-center">
                  {sub.admin_removed ? (
                    <div className="text-center text-on-surface-variant">
                      <ShieldAlert size={24} className="mx-auto mb-1" />
                      <p className="type-label-caps">Removed</p>
                    </div>
                  ) : (
                    <Image 
                      src={sub.media_url || ""} 
                      alt="Proof" 
                      fill 
                      className="object-cover" 
                      unoptimized
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="type-body-sm text-on-surface line-clamp-1">
                    <strong>Submitter:</strong> {sub.profiles?.full_name || "Unknown"}
                  </p>
                  <p className="type-body-sm text-on-surface line-clamp-1">
                    <strong>Challenge:</strong> {sub.challenges?.title || "Unknown"}
                  </p>
                </div>
                {canRemove && !sub.admin_removed && (
                  <Button 
                    variant="outline" 
                    fullWidth
                    className="border-error text-error hover:bg-error/10 text-xs py-1 h-auto"
                    onClick={() => {
                      setRemoveProofId(sub.id);
                    }}
                  >
                    Remove Content
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Remove Modal */}
      {removeProofId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface p-6 rounded-xl shadow-lg w-full max-w-sm space-y-4">
            <h3 className="type-headline-sm text-on-surface font-semibold">Remove Content</h3>
            <p className="type-body-sm text-on-surface-variant">
              Please provide a reason for removal. This is required and will be logged.
            </p>
            <textarea aria-label="Removal reason"
              className="w-full p-3 rounded-lg border border-outline-variant bg-surface-container text-on-surface min-h-[100px] type-body-md"
              placeholder="e.g. Violates community guidelines, spam, explicit content..."
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => {
                setRemoveProofId(null);
                setRemoveReportId(null);
                setRemoveReason("");
              }}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                className="bg-error hover:bg-error/90 text-on-error"
                disabled={!removeReason || removing}
                onClick={handleRemove}
              >
                {removing ? "Removing..." : "Remove Content"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
