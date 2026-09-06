"use client";

/**
 * QuestDetailClient — interactive quest detail page
 *
 * Handles:
 *  - Join flow with optimistic UI
 *  - Proof submission state machine (idle → uploading → success)
 *  - Photo upload with preview
 *  - Rejection reason display + resubmit
 *  - Check-in button for proof_type='checkin'
 *  - Auto-approved display for proof_type='none'
 */

import { useEffect, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MapPin, Users, CheckCircle2, AlertCircle, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Badge, Input } from "@/components/ui";
import type { QuestDetail } from "@/lib/data/quests";
import {
  isUserQuestParticipant,
  getUserQuestParticipation,
  joinQuest,
  submitQuestProof,
  markQuestVisited,
} from "@/lib/data/quests";

interface QuestDetailClientProps {
  quest: QuestDetail;
  currentUserId: string | null;
}

type ProofState = "idle" | "uploading" | "success";

export default function QuestDetailClient({
  quest,
  currentUserId,
}: QuestDetailClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // State
  const [hasJoined, setHasJoined] = useState(false);
  const [participation, setParticipation] = useState<{
    id: string;
    verification_status: "pending" | "approved" | "rejected";
    completed_at: string | null;
    rejection_reason: string | null;
    media_url: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [joiningQuest, setJoiningQuest] = useState(false);

  // Proof submission state
  const [proofState, setProofState] = useState<ProofState>("idle");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Check-in state
  const [checkingIn, setCheckingIn] = useState(false);

  // Load participation status
  useEffect(() => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const isParticipant = await isUserQuestParticipant(
          supabase,
          quest.id,
          currentUserId
        );
        setHasJoined(isParticipant);

        if (isParticipant) {
          const part = await getUserQuestParticipation(
            supabase,
            quest.id,
            currentUserId
          );
          setParticipation(part);
        }
      } catch (err) {
        console.error("Error loading participation:", err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, quest.id]);

  // Handle join
  const handleJoinQuest = useCallback(async () => {
    if (!currentUserId) {
      router.push(`/login?redirectTo=/quests/${quest.id}`);
      return;
    }

    setJoiningQuest(true);
    try {
      const participationId = await joinQuest(
        supabase,
        quest.id,
        currentUserId,
        quest.proof_type
      );

      if (participationId) {
        setHasJoined(true);

        // For proof_type='none', immediately mark as approved
        if (quest.proof_type === "none") {
          setParticipation({
            id: participationId,
            verification_status: "approved",
            completed_at: new Date().toISOString(),
            rejection_reason: null,
            media_url: null,
          });
        } else {
          setParticipation({
            id: participationId,
            verification_status: "pending",
            completed_at: null,
            rejection_reason: null,
            media_url: null,
          });
        }
      }
    } catch (err) {
      console.error("Error joining quest:", err);
      setUploadError("Failed to join quest. Please try again.");
    } finally {
      setJoiningQuest(false);
    }
  }, [currentUserId, quest, supabase, router]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size must be under 5 MB.");
      return;
    }

    setUploadedFile(file);
    setUploadError(null);

    // Preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle proof upload
  const handleUploadProof = useCallback(async () => {
    if (!uploadedFile || !participation?.id || proofState !== "idle") {
      return;
    }

    setProofState("uploading");
    setUploadError(null);

    try {
      const fileName = `${quest.id}/${participation.id}/${Date.now()}_${uploadedFile.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("proof-media")
        .upload(fileName, uploadedFile, { upsert: false });

      if (uploadErr) {
        throw new Error(uploadErr.message);
      }

      const { data } = supabase.storage
        .from("proof-media")
        .getPublicUrl(fileName);

      const mediaUrl = data?.publicUrl;

      if (!mediaUrl) {
        throw new Error("Failed to get media URL");
      }

      // Update participation with proof
      const success = await submitQuestProof(
        supabase,
        participation.id,
        mediaUrl
      );

      if (success) {
        setProofState("success");
        setParticipation((p) =>
          p
            ? { ...p, media_url: mediaUrl, verification_status: "pending" }
            : null
        );
        setUploadedFile(null);
        setPreviewUrl(null);

        // Reset after 2 seconds
        setTimeout(() => {
          setProofState("idle");
        }, 2000);
      } else {
        throw new Error("Failed to save proof");
      }
    } catch (err) {
      setProofState("idle");
      setUploadError(
        err instanceof Error ? err.message : "Failed to upload proof."
      );
    }
  }, [uploadedFile, participation, quest.id, supabase, proofState]);

  // Handle check-in
  const handleCheckIn = useCallback(async () => {
    if (!participation?.id) return;

    setCheckingIn(true);
    try {
      const success = await markQuestVisited(supabase, participation.id);
      if (success) {
        setParticipation((p) =>
          p ? { ...p, verification_status: "pending" } : null
        );
      } else {
        setUploadError("Failed to mark as visited. Please try again.");
      }
    } catch (err) {
      console.error("Error marking visited:", err);
      setUploadError("Failed to mark as visited. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  }, [participation, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="type-body-md text-on-surface-variant">Loading…</p>
      </div>
    );
  }

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
        <h1 className="type-body-md font-semibold text-on-surface flex-1 truncate">
          {quest.title}
        </h1>
      </div>

      <div className="mx-auto max-w-2xl">
        {/* Thumbnail */}
        <div className="relative w-full h-64 bg-surface-container overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={quest.thumbnail_url || ""}
            alt={quest.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Content */}
        <div className="px-4 py-6 flex flex-col gap-4">
          {/* Title & Info */}
          <div>
            <h2 className="type-headline-sm text-on-surface mb-2">
              {quest.title}
            </h2>
            <p className="type-body-md text-on-surface-variant mb-3">
              {quest.business_name}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{quest.category}</Badge>
              <div className="flex items-center gap-1 text-on-surface-variant">
                <MapPin size={16} aria-hidden="true" />
                <span className="type-body-sm">{quest.location_name}</span>
              </div>
              <div className="flex items-center gap-1 text-on-surface-variant">
                <Users size={16} aria-hidden="true" />
                <span className="type-body-sm">
                  {quest.participant_count} joined
                </span>
              </div>
            </div>
          </div>

          {/* Description & Reward */}
          <Card bordered padding="md" className="bg-surface-container-low">
            <div className="space-y-3">
              <div>
                <p className="type-label-caps text-on-surface-variant mb-1">
                  About
                </p>
                <p className="type-body-md text-on-surface">
                  {quest.description}
                </p>
              </div>
              <div>
                <p className="type-label-caps text-on-surface-variant mb-1">
                  Reward
                </p>
                <p className="type-body-md text-on-surface font-semibold">
                  {quest.reward_description}
                </p>
              </div>
            </div>
          </Card>

          {/* Error message */}
          {uploadError && (
            <div className="flex gap-2 rounded-lg bg-error/10 border border-error/30 px-3 py-2">
              <AlertCircle
                size={16}
                className="shrink-0 mt-0.5 text-error"
                aria-hidden="true"
              />
              <p className="type-body-md text-error text-sm">{uploadError}</p>
            </div>
          )}

          {/* CTA Section */}
          {!hasJoined ? (
            // Not joined: Join button
            <Button
              variant="primary"
              fullWidth
              onClick={handleJoinQuest}
              disabled={joiningQuest || !currentUserId}
            >
              {joiningQuest ? "Joining…" : "Join Quest"}
            </Button>
          ) : participation?.verification_status === "approved" ? (
            // Approved: Completed state
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 size={40} className="text-success" aria-hidden="true" />
              <p className="type-body-md font-semibold text-on-surface">
                Completed ✓
              </p>
              <p className="type-body-md text-on-surface-variant">
                Great job! Your submission was approved.
              </p>
            </div>
          ) : participation?.verification_status === "rejected" ? (
            // Rejected: Show reason + resubmit option
            <div className="space-y-3">
              <Card bordered padding="md" className="border-error/30 bg-error/5">
                <p className="type-label-caps text-error mb-2">Rejected</p>
                <p className="type-body-md text-on-surface mb-3">
                  {participation.rejection_reason ||
                    "Your submission did not meet the requirements."}
                </p>
                <Button
                  variant="outline"
                  className="border-error text-error hover:bg-error/10"
                  onClick={() => {
                    setParticipation((p) =>
                      p
                        ? { ...p, verification_status: "pending" }
                        : null
                    );
                    setProofState("idle");
                    setUploadedFile(null);
                    setPreviewUrl(null);
                  }}
                >
                  Resubmit Proof
                </Button>
              </Card>
              {quest.proof_type === "photo" && (
                renderPhotoProofSection(proofState, previewUrl, uploadedFile, handleFileChange, handleUploadProof, () => {
                  setUploadedFile(null);
                  setPreviewUrl(null);
                })
              )}
            </div>
          ) : quest.proof_type === "photo" ? (
            // Photo proof: upload area
            renderPhotoProofSection(proofState, previewUrl, uploadedFile, handleFileChange, handleUploadProof, () => {
              setUploadedFile(null);
              setPreviewUrl(null);
            })
          ) : quest.proof_type === "checkin" ? (
            // Check-in proof: Mark as Visited button
            <div className="space-y-3">
              {participation?.verification_status === "pending" && (
                <p className="type-body-md text-on-surface-variant text-center px-3">
                  Mark as visited to submit your proof.
                </p>
              )}
              <Button
                variant="primary"
                fullWidth
                onClick={handleCheckIn}
                disabled={checkingIn}
              >
                {checkingIn ? "Marking…" : "Mark as Visited"}
              </Button>
              {participation?.verification_status === "pending" && (
                <div className="flex gap-2 rounded-lg bg-secondary/10 border border-secondary/30 px-3 py-2">
                  <AlertCircle
                    size={16}
                    className="shrink-0 mt-0.5 text-secondary"
                    aria-hidden="true"
                  />
                  <p className="type-body-md text-secondary text-sm">
                    Pending review
                  </p>
                </div>
              )}
            </div>
          ) : (
            // proof_type='none': auto-approved message already shown above
            null
          )}

          {/* Creator link (if user is creator) */}
          {currentUserId === quest.creator_id && (
            <Link href={`/creator/quests/${quest.id}/participants`}>
              <Button variant="outline" fullWidth>
                Review Submissions
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Render photo proof upload section
 */
function renderPhotoProofSection(
  proofState: ProofState,
  previewUrl: string | null,
  uploadedFile: File | null,
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  handleUploadProof: () => void,
  onCancelProof: () => void
) {
  return (
    <div className="space-y-3">
      <p className="type-label-caps text-on-surface-variant">Submit Proof</p>

      {proofState === "success" ? (
        // Success state
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 size={40} className="text-success" aria-hidden="true" />
          <p className="type-body-md font-semibold text-on-surface">
            Proof Submitted
          </p>
          <p className="type-body-md text-on-surface-variant">
            Pending review
          </p>
        </div>
      ) : (
        <>
          {previewUrl ? (
            // Preview + upload button
            <div className="space-y-2">
              <div className="relative w-full aspect-square rounded-lg bg-surface-container overflow-hidden border border-outline-variant">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleUploadProof}
                  disabled={proofState === "uploading"}
                >
                  {proofState === "uploading" ? "Uploading…" : "Upload Proof"}
                </Button>
                <Button
                  variant="outline"
                  fullWidth
                  onClick={onCancelProof}
                  disabled={proofState === "uploading"}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            // Upload area
            <label className="flex flex-col items-center justify-center gap-3 py-8 rounded-lg border-2 border-dashed border-outline-variant hover:border-secondary/50 bg-surface-container/50 hover:bg-surface-container cursor-pointer transition-colors">
              <Upload size={32} className="text-on-surface-variant" aria-hidden="true" />
              <div className="text-center">
                <p className="type-body-md font-medium text-on-surface">
                  Upload your proof
                </p>
                <p className="type-body-sm text-on-surface-variant">
                  JPG, PNG or WebP • Max 5 MB
                </p>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
