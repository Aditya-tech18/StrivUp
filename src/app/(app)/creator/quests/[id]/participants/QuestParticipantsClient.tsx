"use client";

/**
 * QuestParticipantsClient — creator review page for quest submissions
 *
 * Lists all participants with their proof (photo, check-in, or none),
 * verification status, and Approve/Reject actions with rejection_reason.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Check, X, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input } from "@/components/ui";
import type { QuestParticipant } from "@/lib/data/quests";
import {
  approveQuestParticipation,
  rejectQuestParticipation,
} from "@/lib/data/quests";

interface QuestParticipantsClientProps {
  questId: string;
  questTitle: string;
  participants: QuestParticipant[];
}

interface ReviewingParticipant {
  participationId: string;
  rejectionReason: string;
}

export default function QuestParticipantsClient({
  questId,
  questTitle,
  participants: initialParticipants,
}: QuestParticipantsClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [participants, setParticipants] = useState(initialParticipants);
  const [reviewing, setReviewing] = useState<ReviewingParticipant | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle approve
  const handleApprove = useCallback(
    async (participationId: string) => {
      setActionInProgress(participationId);
      setError(null);

      try {
        const success = await approveQuestParticipation(supabase, participationId);
        if (success) {
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === participationId
                ? { ...p, verification_status: "approved" as const }
                : p
            )
          );
        } else {
          setError("Failed to approve submission.");
        }
      } catch (err) {
        console.error("Error approving:", err);
        setError("Failed to approve submission.");
      } finally {
        setActionInProgress(null);
      }
    },
    [supabase]
  );

  // Handle reject
  const handleReject = useCallback(
    async (participationId: string, reason: string) => {
      if (!reason.trim()) {
        setError("Please provide a rejection reason.");
        return;
      }

      setActionInProgress(participationId);
      setError(null);

      try {
        const success = await rejectQuestParticipation(
          supabase,
          participationId,
          reason
        );
        if (success) {
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === participationId
                ? {
                    ...p,
                    verification_status: "rejected" as const,
                    rejection_reason: reason.trim(),
                  }
                : p
            )
          );
          setReviewing(null);
        } else {
          setError("Failed to reject submission.");
        }
      } catch (err) {
        console.error("Error rejecting:", err);
        setError("Failed to reject submission.");
      } finally {
        setActionInProgress(null);
      }
    },
    [supabase]
  );

  return (
    <div className="min-h-screen bg-surface pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-surface-container-low border-b border-outline-variant px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="text-on-surface-variant hover:text-on-surface"
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="type-body-md font-semibold text-on-surface truncate">
            {questTitle}
          </h1>
          <p className="type-body-sm text-on-surface-variant">
            {participants.length} submission{participants.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-4 py-6">
        {error && (
          <div className="flex gap-2 rounded-lg bg-error/10 border border-error/30 px-3 py-2 mb-4">
            <AlertCircle
              size={16}
              className="shrink-0 mt-0.5 text-error"
              aria-hidden="true"
            />
            <p className="type-body-md text-error text-sm">{error}</p>
          </div>
        )}

        {participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertCircle size={40} className="text-on-surface-variant opacity-40" aria-hidden="true" />
            <p className="type-body-lg text-on-surface-variant">
              No submissions yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {participants.map((participant) => (
              <Card key={participant.id} bordered padding="md">
                <div className="space-y-3">
                  {/* Participant info */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-container flex-shrink-0 overflow-hidden">
                      {participant.user_profile.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={participant.user_profile.avatar_url}
                          alt={participant.user_profile.full_name ?? "User"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-secondary/20" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="type-body-md font-medium text-on-surface">
                        {participant.user_profile.full_name ?? "Unknown"}
                      </p>
                      <p className="type-body-sm text-on-surface-variant">
                        Joined {new Date(participant.joined_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      {participant.verification_status === "approved" && (
                        <div className="flex items-center gap-1 text-success">
                          <Check size={18} aria-hidden="true" />
                          <span className="type-body-sm font-medium">
                            Approved
                          </span>
                        </div>
                      )}
                      {participant.verification_status === "rejected" && (
                        <div className="flex items-center gap-1 text-error">
                          <X size={18} aria-hidden="true" />
                          <span className="type-body-sm font-medium">
                            Rejected
                          </span>
                        </div>
                      )}
                      {participant.verification_status === "pending" && (
                        <div className="flex items-center gap-1 text-secondary">
                          <AlertCircle size={18} aria-hidden="true" />
                          <span className="type-body-sm font-medium">
                            Pending
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Proof media (if exists) */}
                  {participant.media_url && (
                    <div className="relative w-full h-48 rounded-lg bg-surface-container overflow-hidden border border-outline-variant">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={participant.media_url}
                        alt="Proof submission"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Rejection reason (if rejected) */}
                  {participant.verification_status === "rejected" &&
                    participant.rejection_reason && (
                      <div className="rounded-lg bg-error/5 border border-error/30 px-3 py-2">
                        <p className="type-label-caps text-error text-xs mb-1">
                          Rejection Reason
                        </p>
                        <p className="type-body-sm text-on-surface">
                          {participant.rejection_reason}
                        </p>
                      </div>
                    )}

                  {/* Actions (if pending) */}
                  {participant.verification_status === "pending" && (
                    <div className="space-y-2 pt-2 border-t border-outline-variant">
                      {reviewing?.participationId === participant.id ? (
                        // Reject reason form
                        <div className="space-y-2">
                          <Input
                            label="Rejection reason"
                            placeholder="Why is this submission rejected?"
                            value={reviewing.rejectionReason}
                            onChange={(e) =>
                              setReviewing({
                                ...reviewing,
                                rejectionReason: e.target.value,
                              })
                            }
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              fullWidth
                              size="sm"
                              onClick={() => setReviewing(null)}
                              disabled={actionInProgress === participant.id}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="outline"
                              className="border-error text-error hover:bg-error/10"
                              fullWidth
                              size="sm"
                              onClick={() =>
                                handleReject(
                                  participant.id,
                                  reviewing.rejectionReason
                                )
                              }
                              disabled={actionInProgress === participant.id}
                            >
                              {actionInProgress === participant.id
                                ? "Rejecting…"
                                : "Confirm Reject"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // Approve / Reject buttons
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            fullWidth
                            size="sm"
                            onClick={() =>
                              handleApprove(participant.id)
                            }
                            disabled={actionInProgress === participant.id}
                          >
                            {actionInProgress === participant.id
                              ? "Approving…"
                              : "Approve"}
                          </Button>
                          <Button
                            variant="outline"
                            className="border-error text-error hover:bg-error/10"
                            fullWidth
                            size="sm"
                            onClick={() =>
                              setReviewing({
                                participationId: participant.id,
                                rejectionReason: "",
                              })
                            }
                            disabled={actionInProgress === participant.id}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
