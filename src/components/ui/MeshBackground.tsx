/**
 * MeshBackground — the soft colour wash behind the entry screen.
 *
 * Four overlapping blooms plus a fine dot texture, in StrivUp's blues over
 * surface white. The reference this is modelled on used amber and cream; the
 * shape of the effect is the same, only the palette is ours — every colour
 * below is a token value from globals.css.
 *
 * BUILT FROM GRADIENTS, NOT BLURRED DIVS. The reference renders four absolutely
 * positioned circles, each `blur-3xl`, inside a wrapper that is itself
 * `blur-xl` — five filter passes over a full-screen area, recomputed on every
 * resize, on the first screen anyone loads. Stacked radial-gradients give the
 * same soft bloom as a single paint with no filter at all. On a mid-range
 * Android phone that is the difference between a backdrop you notice and one
 * you don't.
 *
 * CONTRAST IS THE CONSTRAINT. The colour is pushed to the corners and kept
 * weak through the middle, because the headline, the body copy and both role
 * cards sit in that central column and have to stay legible. The darkest point
 * behind any text measures ~1.04:1 against surface white — i.e. the tint there
 * is nearly nothing, so the text contrast ratios are the token pairings
 * unchanged.
 */

/* Token values, written out because a CSS gradient cannot take a Tailwind
   colour utility. If a token changes in globals.css, change it here too.
     secondary            #1d4ed8
     secondary-container  #4069f2
     secondary-fixed-dim  #b7c4ff
     secondary-fixed      #dce1ff
     surface              #fbf9f9
     on-surface           #1b1c1c  (the dot texture) */
const MESH = [
  // Top-left bloom — the deep brand blue. Anchored off-canvas so its strongest
  // point never reaches the headline.
  "radial-gradient(58% 52% at 2% -12%, rgba(29, 78, 216, 0.42), transparent 66%)",
  // Top-right, brighter blue, also anchored past the edge.
  "radial-gradient(54% 50% at 104% -4%, rgba(64, 105, 242, 0.40), transparent 66%)",
  // Bottom-left, periwinkle, and the strongest of the four. Anchored outside
  // the viewport on both axes: the "Log in" link and the eyebrow pill are
  // text-secondary at small sizes, and secondary over this colour at full
  // strength is 4.26:1 — under AA. Keeping every peak off the centre column
  // means the text sits on something much closer to surface white, so the
  // contrast does not depend on where the blob happens to land.
  "radial-gradient(60% 54% at -6% 112%, rgba(183, 196, 255, 0.85), transparent 66%)",
  // Bottom-right, paler, to keep the lower half from going flat.
  "radial-gradient(56% 50% at 106% 108%, rgba(145, 170, 255, 0.62), transparent 66%)",
  // A wide, very weak wash so the two halves meet in colour rather than in
  // bare surface white. Weak enough to be irrelevant to contrast.
  "radial-gradient(85% 55% at 50% 45%, rgba(220, 225, 255, 0.30), transparent 72%)",
  // Base.
  "#fbf9f9",
].join(", ");

export function MeshBackground({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 ${className}`}>
      <div className="absolute inset-0" style={{ background: MESH }} />

      {/* A 4px dot grid at ~3% opacity. Invisible as dots at arm's length —
          it just stops the large flat gradients looking like banding on cheap
          panels, which is the same reason the reference has one. */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: "radial-gradient(circle at center, #1b1c1c 1px, transparent 1px)",
          backgroundSize: "4px 4px",
        }}
      />
    </div>
  );
}
