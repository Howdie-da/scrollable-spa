// Vite/React — no 'use client' needed

/**
 * Revealed.tsx
 * -------------------------------------------------------------------------
 * A full-viewport, pinned scroll-scrubbing sequence: a pre-rendered video of
 * a rotating 3D cake is scrubbed frame-by-frame against scroll position
 * (rather than played back in time), ending on a locked top-down frame with
 * five clickable "candle" hotspots that each reveal a hidden wish.
 *
 * Dependencies:
 *   npm install gsap
 *
 * Usage:
 *   <Revealed videoSrc="/cake-reveal.mp4" posterSrc="/cake-reveal-poster.jpg" />
 *
 * Notes on the video asset:
 *   - Export an H.264 mp4 (and ideally a webm fallback) with NO audio track,
 *     a solid #000000 background, starting on the 3/4 top-side frame and
 *     ending on the perfect top-down frame described in the brief.
 *   - Encode with a decent keyframe interval (every ~15 frames) so seeking
 *     via `currentTime` stays smooth — scrubbing seeks constantly and long
 *     GOPs make that stutter.
 *   - If you'd rather scrub an image sequence on a <canvas> for pixel-perfect
 *     frame control, swap the <video> block for the CanvasSequence variant
 *     stubbed at the bottom of this file — the scroll/GSAP wiring is
 *     identical, only the paint step changes.
 * -------------------------------------------------------------------------
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import CakeScene from "./CakeScene";

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Content: five wishes tied to five candles. Edit freely.
// Positions are in PERCENT of the video frame's width/height, measured on
// the FINAL (top-down) frame, so they stay aligned at any viewport size.
// ---------------------------------------------------------------------------

interface Candle {
  id: string;
  label: string; // accessible label, not shown visually
  wish: string;
  xPercent: number; // 0–100, left offset within the video frame
  yPercent: number; // 0–100, top offset within the video frame
}

const CANDLES: Candle[] = [
  {
    id: "candle-1",
    label: "Candle one",
    wish: "Wishing you a year where the good days outnumber the hard ones.",
    xPercent: 34,
    yPercent: 42,
  },
  {
    id: "candle-2",
    label: "Candle two",
    wish: "May the people who matter most stay close all year long.",
    xPercent: 46,
    yPercent: 33,
  },
  {
    id: "candle-3",
    label: "Candle three",
    wish: "Here's to trying the thing you've been putting off.",
    xPercent: 58,
    yPercent: 40,
  },
  {
    id: "candle-4",
    label: "Candle four",
    wish: "May you rest more easily than you did this year.",
    xPercent: 50,
    yPercent: 52,
  },
  {
    id: "candle-5",
    label: "Candle five",
    wish: "Happy birthday. This one's just for you.",
    xPercent: 41,
    yPercent: 58,
  },
];

// The video's intrinsic aspect ratio (width / height). Adjust to match your
// actual export — this keeps the hotspot overlay pinned to the frame at
// every viewport size regardless of letterboxing.
const VIDEO_ASPECT_RATIO = 16 / 9;

interface RevealedProps {
  morph: boolean;
  setMorph: (v: boolean) => void;
  videoSrc?: string;
  posterSrc?: string;
  className?: string;
}

// Inner component: only rendered when a real video is provided.
// Kept separate so React hooks are never called conditionally.
function VideoRevealed({
  setMorph,
  videoSrc,
  posterSrc,
  className = "",
}: RevealedProps & { videoSrc: string }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);
  const outroRef = useRef<HTMLDivElement | null>(null);
  const scrollHintRef = useRef<HTMLDivElement | null>(null);

  const [videoReady, setVideoReady] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [blownCandles, setBlownCandles] = useState<Set<string>>(new Set());
  const [activeWish, setActiveWish] = useState<Candle | null>(null);

  const isFinalFrame = scrollProgress > 0.98;
  const hasStartedScrolling = scrollProgress > 0.02;

  // -------------------------------------------------------------------
  // 1. Prime the video: load metadata, then hold on frame 0 (paused).
  //    Scrubbing is driven entirely by setting `currentTime` manually —
  //    the video element is never allowed to play on its own.
  // -------------------------------------------------------------------
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setVideoReady(true);
  }, []);

  // -------------------------------------------------------------------
  // 2. GSAP ScrollTrigger: the outer div is a self-contained scroller
  //    (overflow-y: scroll). The inner section is sticky. We tell GSAP
  //    about the custom scroller so it doesn't touch document.body.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!videoReady) return;
    const section = sectionRef.current;
    const video = videoRef.current;
    const scroller = scrollerRef.current;
    if (!section || !video || !scroller) return;

    const duration = video.duration || 0;
    if (!duration) return;

    // Register this div as a custom scroller with GSAP
    ScrollTrigger.defaults({ scroller });

    const scrubDistance = () => Math.max(window.innerHeight * 2.2, 1200);

    const st = ScrollTrigger.create({
      trigger: section,
      scroller,
      start: "top top",
      end: () => `+=${scrubDistance()}`,
      pin: true,
      pinSpacing: true,
      scrub: 0.4,
      anticipatePin: 1,
      onUpdate: (self) => {
        const progress = self.progress;
        setScrollProgress(progress);
        const targetTime = progress * duration;
        if (Math.abs(video.currentTime - targetTime) > 0.01) {
          video.currentTime = targetTime;
        }
      },
    });

    return () => {
      st.kill();
      ScrollTrigger.defaults({ scroller: undefined });
    };
  }, [videoReady]);

  // -------------------------------------------------------------------
  // 3. Text crossfade driven by the same scroll progress, via GSAP
  //    rather than React re-renders, for a smoother fade curve.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!videoReady) return;
    const intro = introRef.current;
    const outro = outroRef.current;
    const hint = scrollHintRef.current;
    if (!intro || !outro || !hint) return;

    // Intro text + hint: fade out fast, in the first ~12% of the scrub.
    gsap.to([intro, hint], {
      opacity: hasStartedScrolling ? 0 : 1,
      y: hasStartedScrolling ? -16 : 0,
      duration: 0.4,
      ease: "power2.out",
      overwrite: "auto",
    });

    // Outro text: only fades in once we're essentially at the final frame.
    gsap.to(outro, {
      opacity: isFinalFrame ? 1 : 0,
      y: isFinalFrame ? 0 : 16,
      duration: 0.5,
      ease: "power2.out",
      overwrite: "auto",
      pointerEvents: isFinalFrame ? "auto" : "none",
    });
  }, [hasStartedScrolling, isFinalFrame, videoReady]);

  // -------------------------------------------------------------------
  // 4. Candle interaction: only active once we've settled on the final
  //    frame. Clicking/tapping a hotspot "blows out" that candle and
  //    reveals its wish.
  // -------------------------------------------------------------------
  const handleCandleActivate = useCallback(
    (candle: Candle) => {
      if (!isFinalFrame) return;
      setBlownCandles((prev) => {
        const next = new Set(prev);
        next.add(candle.id);
        return next;
      });
      setActiveWish(candle);
    },
    [isFinalFrame]
  );

  return (
    /* Outer: self-contained scroll container filling the fixed overlay */
    <div
      ref={scrollerRef}
      className="fixed inset-0 bg-black overflow-y-auto"
      style={{ scrollbarWidth: "none" }}
    >
      <style>{`::-webkit-scrollbar{display:none}`}</style>

      {/* Sticky inner section — pinned by GSAP ScrollTrigger */}
      <section
        ref={sectionRef}
        className={`relative w-full h-screen overflow-hidden bg-black ${className}`}
        style={{ backgroundColor: "#000000" }}
      >
      {/* Static black backdrop — never animated, never repainted */}
      <div className="absolute inset-0 bg-black" aria-hidden="true" />

      {/* Back to landing */}
      <button
        onClick={() => setMorph(false)}
        className="absolute top-5 left-5 z-50 px-4 py-2 rounded-full border border-white/10 text-white/35 hover:text-white hover:border-white/25 text-sm transition-all cursor-pointer"
      >
        ← Back
      </button>

      {/* Video frame, centered and aspect-locked so overlay math stays valid */}
      <div
        ref={frameRef}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div
          className="relative w-full h-full max-h-screen"
          style={{
            aspectRatio: `${VIDEO_ASPECT_RATIO}`,
            maxWidth: "100vw",
            margin: "0 auto",
          }}
        >
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              poster={posterSrc}
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={handleLoadedMetadata}
              className="absolute inset-0 w-full h-full object-contain"
              aria-label="A three dimensional cake with five lit candles, rotating from a three-quarter view into a top-down view as you scroll"
            />
          ) : (
            /* No video yet — placeholder so the layout & interaction still work */
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-white/10 text-sm tracking-widest uppercase select-none">
                Drop your cake video at /cake-reveal.mp4
              </div>
            </div>
          )}

          {/* -------------------------------------------------------
              Candle hotspots. Positioned in percent of the video
              frame so they track the cake at any screen size.
              Only interactive (and only visible to focus/hover) once
              the final top-down frame is reached.
             ------------------------------------------------------- */}
          <div
            className="absolute inset-0"
            style={{ pointerEvents: isFinalFrame ? "auto" : "none" }}
          >
            {CANDLES.map((candle) => {
              const blown = blownCandles.has(candle.id);
              return (
                <button
                  key={candle.id}
                  type="button"
                  aria-label={
                    blown
                      ? `${candle.label}, already blown out`
                      : `Blow out ${candle.label}`
                  }
                  onClick={() => handleCandleActivate(candle)}
                  disabled={!isFinalFrame}
                  className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${candle.xPercent}%`,
                    top: `${candle.yPercent}%`,
                    width: "clamp(28px, 6vw, 56px)",
                    height: "clamp(28px, 6vw, 56px)",
                    opacity: isFinalFrame ? 1 : 0,
                    transition: "opacity 0.4s ease",
                  }}
                >
                  {/* Invisible hit target */}
                  <span className="absolute inset-0 rounded-full" />
                  {/* Subtle affordance ring, visible on hover/focus only */}
                  <span
                    className="absolute inset-0 rounded-full border border-white/0 group-hover:border-white/40 group-focus-visible:border-white/60 transition-colors duration-300"
                    style={{
                      boxShadow: blown
                        ? "none"
                        : "0 0 0 0 rgba(255,255,255,0)",
                    }}
                  />
                  {blown && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-1 h-1 rounded-full bg-white/70" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Intro copy */}
      <div
        ref={introRef}
        className="pointer-events-none absolute inset-0 flex items-center justify-center px-6"
      >
        <h1
          className="text-center font-light tracking-tight text-white"
          style={{ fontSize: "clamp(1.75rem, 5vw, 3.5rem)" }}
        >
          Here is your cake
        </h1>
      </div>

      {/* Scroll indicator, left aligned, bobbing loop */}
      <div
        ref={scrollHintRef}
        className="pointer-events-none absolute left-6 bottom-8 sm:left-10 sm:bottom-12 flex items-center gap-3 text-white/70"
      >
        <span
          className="text-xs sm:text-sm uppercase tracking-[0.2em]"
          style={{ animation: "revealed-bob 1.8s ease-in-out infinite" }}
        >
          Scroll down
        </span>
      </div>

      {/* Outro copy, fades in only once the final frame is reached */}
      <div
        ref={outroRef}
        className="absolute inset-x-0 bottom-16 sm:bottom-20 flex items-center justify-center px-6"
        style={{ opacity: 0 }}
      >
        <p
          className="text-center text-white/90 font-light tracking-tight"
          style={{ fontSize: "clamp(1.1rem, 3vw, 1.75rem)" }}
        >
          Blow the candle to see the wishes. Click on them
        </p>
      </div>

      {/* Revealed wish panel */}
      {activeWish && (
        <div
          className="absolute inset-x-0 top-10 sm:top-14 flex justify-center px-6"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-6 py-4 text-center">
            <p className="text-white/90 text-sm sm:text-base font-light">
              {activeWish.wish}
            </p>
          </div>
        </div>
      )}

      {/* Progress indicator for the count of revealed wishes */}
      {isFinalFrame && (
        <div className="absolute right-6 bottom-8 sm:right-10 sm:bottom-12 text-white/50 text-xs tracking-widest">
          {blownCandles.size} / {CANDLES.length} wishes
        </div>
      )}

      <style>{`
        @keyframes revealed-bob {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50% { transform: translateY(6px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="revealed-bob"] { animation: none !important; }
        }
      `}</style>
      </section>
    </div>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────
// Routes to the live 3D cake when no video is provided,
// or to the GSAP video-scrub path when a real mp4 is available.
export default function Revealed({
  setMorph,
  morph,
  videoSrc = "",
  posterSrc,
  className,
}: RevealedProps) {
  if (!videoSrc) {
    return <CakeScene setMorph={setMorph} />;
  }
  return (
    <VideoRevealed
      setMorph={setMorph}
      morph={morph}
      videoSrc={videoSrc}
      posterSrc={posterSrc}
      className={className}
    />
  );
}
