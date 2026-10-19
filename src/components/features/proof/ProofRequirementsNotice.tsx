import { AlertCircle, Camera, Check } from "lucide-react";
import type { ProofRequirement } from "@/lib/data/proofRequirements";

/**
 * ProofRequirementsNotice — shown to the participant BEFORE they upload.
 *
 * The whole point is that nobody should have to guess and then get rejected.
 * These are the exact lines the reviewer judges against, so showing them is
 * both fairer and cheaper: fewer wasted uploads, fewer rejections to appeal.
 *
 * The "won't be accepted" list is deliberately visible. It is not there to
 * scold — it names the specific near-miss someone would otherwise submit in
 * good faith, like a photo of a book for a reading task.
 */
export function ProofRequirementsNotice({
  requirement,
  className = "",
}: {
  requirement: ProofRequirement;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-blue-100 bg-blue-50/50 p-3 ${className}`}>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-blue-900">
        <Camera className="h-3.5 w-3.5" />
        What to upload
      </p>

      {requirement.participant_hint && (
        <p className="mb-2.5 text-xs leading-relaxed text-gray-700">
          {requirement.participant_hint}
        </p>
      )}

      {requirement.required_elements.length > 0 && (
        <>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Your photo must show
          </p>
          <ul className="mb-2.5 space-y-1">
            {requirement.required_elements.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-800">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {requirement.optional_elements.length > 0 && (
        <p className="mb-2.5 text-[11px] text-gray-500">
          Helps if included: {requirement.optional_elements.join(", ")}.
        </p>
      )}

      {requirement.reject_if.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-amber-900">
            <AlertCircle className="h-3 w-3" />
            Won&apos;t be accepted
          </p>
          <ul className="space-y-0.5">
            {requirement.reject_if.map((item, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-amber-800">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
