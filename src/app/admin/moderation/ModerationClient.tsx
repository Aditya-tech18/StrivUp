"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Shield, ShieldAlert, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, Button } from "@/components/ui";

/* ── Row shapes ─────────────────────────────────────────────────────────────
   Both queries embed to-one relations, so each nested key is an object or
   null, never an array. These replace the `any[]` state and the per-read
   `as any` casts that were needed to get at the nested fields. */
interface PersonRef { full_name: string | null; avatar_url: string | null }
interface ChallengeRef { title: string | null }

interface ProofSubmissionRow {
  id: string;
  media_url: string | null;
  caption: string | null;
  admin_removed: boolean | null;
  user_id: string;
  challenge_id?: string | null;
  profiles: PersonRef | null;
  challenges: ChallengeRef | null;
}

interface ProofReportRow {
  id: string;
  reason: string | null;
  status: string;
  created_at: string;
  proof_id: string;
  proof_submissions: ProofSubmissionRow | null;
}

export default function ModerationClient({ 
  moderatorRole, 
  currentUserId 
}: { 
  moderatorRole: string;
  currentUserId: string;
}) {
  const [tab, setTab] = useState<"reports" | "all">("reports");
  // Created once. As a plain call in the render body it was a new client on
  // every render, which would make loadData's identity change every render and
  // refire the effect in a loop.
  const [supabase] = useState(() => createClient());

  const canRemove = moderatorRole === "senior_moderator" || moderatorRole === "super_admin";

  const [reports, setReports] = useState<ProofReportRow[]>([]);
  const [submissions, setSubmissions] = useState<ProofSubmissionRow[]>([]);

  // `loading` is derived rather than stored. It used to be its own state that
  // the fetch effect set to true in its first synchronous line, which is the
  // cascading-render pattern react-hooks/set-state-in-effect warns about.
  // Recording which tab the data on screen belongs to answers the same
  // question without a setState before the first await.
  const [loadedTab, setLoadedTab] = useState<"reports" | "all" | null>(null);
  const loading = loadedTab !== tab;

  // Bumped after a removal so the fetch effect re-runs. A background refresh
  // deliberately does not reset loadedTab, so the list stays on screen instead
  // of blanking out.
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal state
  const [removeProofId, setRemoveProofId] = useState<string | null>(null);
  const [removeReportId, setRemoveReportId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removing, setRemoving] = useState(false);

  /* The two reads are plain functions that return rows and touch no state, so
     every setState below happens inside the effect's async callback after an
     await. That is the shape react-hooks/set-state-in-effect asks for:
     subscribe to an external system, set state when it answers. The previous
     version called a state-setting helper straight from the effect body. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
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

        if (cancelled) return;
        if (!error && data) {
          const rows = data as unknown as ProofReportRow[];
          setReports(rows.filter(r => !r.proof_submissions?.admin_removed));
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

        if (cancelled) return;
        if (!error && data) {
          setSubmissions(data as unknown as ProofSubmissionRow[]);
        }
      }
      if (!cancelled) setLoadedTab(tab);
    })();

    return () => { cancelled = true; };
  }, [supabase, tab, refreshKey]);

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
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="measure-console mx-auto space-y-6">
        <div>
          <h1 className="text-headline-lg-mobile text-on-surface flex items-center gap-2">
            <Shield className="text-secondary" /> Moderation Dashboard
          </h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Role: <span className="font-semibold text-secondary">{moderatorRole}</span>
          </p>
        </div>

        <div className="flex gap-2 border-b border-outline-variant">
          <button 
            className={`px-4 py-2 text-body-md font-medium border-b-2 ${tab === "reports" ? "border-secondary text-secondary" : "border-transparent text-on-surface-variant"}`}
            onClick={() => setTab("reports")}
          >
            Pending Reports
          </button>
          <button 
            className={`px-4 py-2 text-body-md font-medium border-b-2 ${tab === "all" ? "border-secondary text-secondary" : "border-transparent text-on-surface-variant"}`}
            onClick={() => setTab("all")}
          >
            All Proof
          </button>
        </div>

        {loading ? (
          <p className="text-body-md text-on-surface-variant">Loading...</p>
        ) : tab === "reports" ? (
          <div className="space-y-4">
            {reports.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No pending reports.</p>
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
                    <p className="text-overline text-error">Report Reason: {report.reason}</p>
                    <p className="text-body-sm text-on-surface">
                      <strong>Submitter:</strong> {report.proof_submissions?.profiles?.full_name || "Unknown"}
                    </p>
                    <p className="text-body-sm text-on-surface">
                      <strong>Challenge:</strong> {report.proof_submissions?.challenges?.title || "Unknown"}
                    </p>
                    <p className="text-body-sm text-on-surface">
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
                      <p className="text-overline">Removed</p>
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
                  <p className="text-body-sm text-on-surface line-clamp-1">
                    <strong>Submitter:</strong> {sub.profiles?.full_name || "Unknown"}
                  </p>
                  <p className="text-body-sm text-on-surface line-clamp-1">
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
          <div className="bg-surface p-6 rounded-xl elev-5 w-full max-w-sm space-y-4">
            <h3 className="text-headline-md text-on-surface font-semibold">Remove Content</h3>
            <p className="text-body-sm text-on-surface-variant">
              Please provide a reason for removal. This is required and will be logged.
            </p>
            <textarea
              className="w-full p-3 rounded-lg border border-outline-variant bg-surface-container text-on-surface min-h-[100px] text-body-md"
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
