"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { observeProofReview, type ProofReviewResult } from "@/lib/data/proofReviewStatus";

/** Watch saved state, never re-submit work. Hidden tabs do no polling. */
export function ProofReviewWatcher({ submissionId, onResult }: {
  submissionId: string;
  onResult: (result: ProofReviewResult) => void;
}) {
  const callback = useRef(onResult);
  useEffect(() => { callback.current = onResult; }, [onResult]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        try {
          const result = await observeProofReview(createClient(), submissionId, { waitMs: 0 });
          if (cancelled) return;
          if (result.reviewState !== "queued") { callback.current(result); return; }
        } catch { /* Keep observing after a transient read failure. */ }
      }
      timer = setTimeout(check, 15_000);
    }
    void check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [submissionId]);
  return null;
}
