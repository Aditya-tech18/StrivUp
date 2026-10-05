"use client";

import { useEffect, useRef } from "react";

/**
 * ShaderBackground — the drifting smoke behind the auth screens.
 *
 * A full-screen WebGL fragment shader. Adapted from the reference design, with
 * four changes that matter on the phones StrivUp actually runs on:
 *
 *   THE RENDER LOOP STARTS ONCE. The reference re-ran its effect whenever the
 *   pointer moved and started a fresh requestAnimationFrame loop each time,
 *   without cancelling the previous one — so every mouse movement permanently
 *   added another loop and the page got slower the longer you looked at it.
 *   Pointer position lives in a ref here, read by the one loop that exists.
 *
 *   IT STOPS WHEN NOBODY IS LOOKING. Paused on tab hide and on unmount, and
 *   GL resources are released. A login screen has no business burning battery
 *   in a background tab.
 *
 *   IT HONOURS prefers-reduced-motion. One static frame, no animation, in line
 *   with the rest of globals.css.
 *
 *   IT RESIZES ON RESIZE. The reference reassigned canvas.width every frame,
 *   which reallocates the drawing buffer 60 times a second. Here the buffer is
 *   sized only when the element's size actually changes, and device pixel
 *   ratio is capped so a 3x phone screen does not render nine times the pixels
 *   for a blurred backdrop.
 *
 * If WebGL is unavailable the component renders nothing and the CSS gradient
 * behind it shows through, which is a perfectly good background on its own.
 */

const VERTEX_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision mediump float;

uniform vec2  iResolution;
uniform float iTime;
uniform vec2  iMouse;
uniform vec3  u_color;

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 centered = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);

  float time = iTime * 0.5;

  // Pointer, remapped to the same -1..1 space as the UVs.
  vec2 ripple = 2.0 * (iMouse / iResolution) - 1.0;

  // Successive harmonics fold the plane into itself; this is what reads as smoke.
  vec2 d = centered;
  for (float i = 1.0; i < 8.0; i++) {
    d.x += 0.5 / i * cos(i * 2.0 * d.y + time + ripple.x * 3.1415);
    d.y += 0.5 / i * cos(i * 2.0 * d.x + time + ripple.y * 3.1415);
  }

  float wave = abs(sin(d.x + d.y + time));
  float glow = smoothstep(0.9, 0.2, wave);

  gl_FragColor = vec4(u_color * glow, 1.0);
}
`;

/** "#1d4ed8" → [0.11, 0.31, 0.85]. Falls back to black on a malformed value. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("ShaderBackground: compile failed", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function ShaderBackground({
  /** Hex. Defaults to StrivUp's action blue (--color-secondary). */
  color = "#1d4ed8",
  className = "",
}: {
  color?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Pointer lives in a ref, never in state: state would re-render the tree on
  // every mousemove, which is what made the original restart its render loop.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl", { antialias: false, depth: false, alpha: false }) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return; // No WebGL — the CSS gradient underneath carries the screen.

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("ShaderBackground: link failed", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Two triangles covering clip space.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const positionLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "iResolution");
    const uTime = gl.getUniformLocation(program, "iTime");
    const uMouse = gl.getUniformLocation(program, "iMouse");
    const uColor = gl.getUniformLocation(program, "u_color");

    const [r, g, b] = hexToRgb(color);
    gl.uniform3f(uColor, r, g, b);

    // A blurred backdrop gains nothing from a 3x buffer, and costs ~9x the
    // fragment work on a phone.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas || !gl) return;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uResolution, w, h);
    }

    function draw(elapsedSeconds: number) {
      if (!gl) return;
      resize();
      gl.uniform1f(uTime, elapsedSeconds);
      const p = pointerRef.current;
      gl.uniform2f(
        uMouse,
        p ? p.x * dpr : width / 2,
        // GL's origin is bottom-left; the DOM's is top-left.
        p ? height - p.y * dpr : height / 2
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    const start = performance.now();

    if (reduceMotion) {
      // One frame, held. Still a real image, just not a moving one.
      draw(0);
    } else {
      const loop = () => {
        draw((performance.now() - start) / 1000);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    function onPointerMove(event: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function onPointerLeave() {
      pointerRef.current = null;
    }

    // Pause in a hidden tab. requestAnimationFrame already throttles, but it is
    // not guaranteed to stop, and this makes the intent explicit.
    function onVisibility() {
      if (reduceMotion) return;
      if (document.hidden) {
        cancelAnimationFrame(frame);
      } else {
        const loop = () => {
          draw((performance.now() - start) / 1000);
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      }
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [color]);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* Shows on its own when WebGL is unavailable, and deepens the shader
          when it is. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#13306e_0%,#0b0b0d_60%,#000000_100%)]" />
      <canvas ref={canvasRef} className="h-full w-full opacity-70" />
      {/* Softens the shader so form text stays readable over it. */}
      <div className="absolute inset-0 backdrop-blur-sm" />
    </div>
  );
}
