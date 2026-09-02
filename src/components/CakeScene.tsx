/**
 * CakeScene.tsx
 * -----------------------------------------------------------------------
 * Real-time 3D birthday cake, React Three Fiber. Scroll-scrubs the camera
 * from a 3/4 top view to straight top-down; 5 candles are clickable once
 * the final frame is reached.
 *
 * This revision restyles the cake itself to match a reference photo:
 * a smooth glossy white buttercream cake with a layered RUFFLED piped
 * border around the top rim and the base, hand-painted florals (purple/
 * blue blossoms, green leaf vines) wreathing the top and trailing down
 * the sides, scattered confetti sprinkles, and a plain pale board.
 *
 *   - top frosting is smoother/glossier (less foam bump) so painted
 *     florals read clearly against it
 *   - two-tier wavy "ruffle" trim (tube geometry along a scalloped
 *     closed curve) replaces the old vertical drip blobs, at both the
 *     top edge and the base
 *   - floral + sprinkle decoration is painted procedurally onto
 *     transparent canvas textures and applied as thin decal meshes:
 *     one disc on the top, one open cylinder wrapping the upper sides
 *   - strawberries removed (not present in the reference)
 *   - cake board is now a plain rounded-square pale board instead of
 *     the wood board
 *   - candles, flames, wax textures, camera rig, wishes UI unchanged
 *
 * New dependencies beyond the original:
 *   npm install @react-three/drei @react-three/postprocessing
 *
 * If you'd rather not pull in postprocessing, delete the <EffectComposer>
 * block at the bottom of the Canvas — everything else works standalone.
 * -----------------------------------------------------------------------
 */

import { useRef, useState, useEffect, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";

// ─── Config ───────────────────────────────────────────────────────────────────

const CANDLE_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#818cf8"];
const CANDLE_ANGLES_DEG = [0, 72, 144, 216, 288];
const CANDLE_RADIUS = 0.38;
const CAKE_RADIUS = 1.2;
const CAKE_HEIGHT = 0.75;
const TOP_Y = CAKE_HEIGHT / 2; // 0.375

const WISHES = [
  "May you have the best year ahead. \n Your age starts with 2 now, so you better act like it kid, I am sure that you will do great.",
  "May you have more confidence in life, \n your narcissism suits you, but do not just wear that mask to protect yourself, \n take pride in yourself and never submit yourself to anything in life.",
  "May you never think that you are unworthy of happiness. \n You are soooo worth it, You deserve more. \n Actually, there is no limit to how much joy you can have. \n Be greedy if I must say. You are limitless.",
  "May you grow stronger this year, \n May you grow stronger in kindness, May your grow stronger in health, \n May you grow stronger in wealth. \n May you heal in a way that makes you feel more YOU.",
  "Mannn, the world is a harsh place. So even if nothing feels right, may you never stop treating yourself with kindness. \n I hope you realize solitude only brings sadness and... in the end, it is just a way to punish yourself. You do not need people, \n but realizing you cannot be happy without them, is very important. Cherish the bonds you have right now, so you may not regret them later.",
];

// Deterministic pseudo-random so organic shapes (ruffles, florals, etc.)
// don't jitter between renders or hot-reloads.
function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Procedural textures (built once, on the client, via <canvas>) ──────────

// Subtle, smoother whipped-cream micro-texture for the top frosting layer.
// Much less "foamy" than a piped-swirl look — mostly a fine grain plus a
// handful of soft spatula passes, since the reference photo's top surface
// reads as smooth and glossy with the floral painting as the real detail.
function useSmoothCreamTexture() {
  return useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;

    // A few very soft, wide spatula passes — barely visible relief
    for (let i = 0; i < 4; i++) {
      const radius = 90 + i * 110;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.03) {
        const r = radius + Math.sin(a * (4 + i) + i) * 10;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${140 + i * 4}, ${140 + i * 4}, ${140 + i * 4}, 0.35)`;
      ctx.lineWidth = 20 - i * 2;
      ctx.stroke();
    }

    // Fine grain, low amplitude
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const n1 = Math.sin(x * 0.5) * Math.cos(y * 0.5);
        const n2 = Math.sin(x * 1.1 + y * 0.3) * Math.cos(y * 1.1 - x * 0.2);
        const grain = (n1 * 0.6 + n2 * 0.4) * 5;
        data[idx] = Math.min(255, Math.max(0, data[idx] + grain));
        data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + grain));
        data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + grain));
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

function useWaxStripeTexture(base: string) {
  return useMemo(() => {
    const w = 64;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // faint vertical striations, like extruded wax
    for (let x = 0; x < w; x += 3) {
      ctx.fillStyle = `rgba(255,255,255,${(x % 6 === 0 ? 0.1 : 0.04)})`;
      ctx.fillRect(x, 0, 1.4, h);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(3, 1);
    return tex;
  }, [base]);
}

function useGlowSpriteTexture() {
  return useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);
}

function useWoodBoardTexture() {
  return useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Light brown natural oak / birch base gradient
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "#b0855e");
    grad.addColorStop(0.35, "#bd936c");
    grad.addColorStop(0.7, "#c49a73");
    grad.addColorStop(1, "#ab8059");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Fine organic wood grain streaks & fiber lines
    for (let i = 0; i < 120; i++) {
      const y = (i / 120) * size + (seededRandom(i) - 0.5) * 8;
      const alpha = 0.04 + seededRandom(i + 12) * 0.1;
      const isDark = seededRandom(i + 45) > 0.4;
      ctx.strokeStyle = isDark ? `rgba(90, 55, 28, ${alpha})` : `rgba(235, 205, 175, ${alpha * 0.75})`;
      ctx.lineWidth = 1.2 + seededRandom(i + 8) * 2.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 35) {
        const wave = Math.sin((x / size) * Math.PI * 3 + i * 0.35) * (3 + seededRandom(i) * 5);
        ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }

    // Subtle natural growth rings
    for (let k = 0; k < 3; k++) {
      const kx = 180 + seededRandom(k * 7) * (size - 360);
      const ky = 180 + seededRandom(k * 7 + 1) * (size - 360);
      for (let r = 10; r < 140; r += 16) {
        ctx.strokeStyle = `rgba(80, 48, 22, ${0.03 + seededRandom(k + r) * 0.05})`;
        ctx.lineWidth = 1.5 + seededRandom(r) * 1.5;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 1.6, r * 0.75, 0.2 + k * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

// ─── Floral decal textures ────────────────────────────────────────────────
// Painted on transparent canvases (nothing filled = alpha 0) so they can
// sit as thin decal layers directly on top of the frosting — purple/blue
// five-petal blossoms, tiny white accent flowers, curved leaf vines, and
// scattered confetti sprinkles, echoing the reference cake's hand-painted
// wreath design.

const FLORAL_PALETTE = {
  purple: "#8b7bd8",
  purpleLight: "#a99be0",
  leafGreen: "#3f6b3a",
  leafGreenLight: "#4f7a45",
  sprinkles: ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#ec4899"],
};

function drawPaintedLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.3, -len * 0.26, len, 0);
  ctx.quadraticCurveTo(len * 0.3, len * 0.26, 0, 0);
  ctx.fill();
  ctx.restore();
}

function drawPaintedFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string
) {
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    ctx.save();
    ctx.translate(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.55, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#fef3c7";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.26, 0, Math.PI * 2);
  ctx.fill();
}

function drawTinyWhiteFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number
) {
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    ctx.save();
    ctx.translate(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    ctx.rotate(a);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.4, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

// Top-of-cake wreath: a ring of stem/leaf/flower clusters near the inner
// edge, leaving the center mostly bare, plus loose confetti sprinkles.
function useFloralTopTexture() {
  return useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const { purple, purpleLight, leafGreen, sprinkles } = FLORAL_PALETTE;

    const cx = size / 2;
    const cy = size / 2;
    const ringR = size * 0.33;

    function drawStem(angle: number, len: number, curve: number) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.strokeStyle = leafGreen;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(ringR - len * 0.5, 0);
      ctx.quadraticCurveTo(ringR, curve, ringR + len * 0.5, 0);
      ctx.stroke();
      ctx.restore();
    }

    const clusters = 6;
    for (let i = 0; i < clusters; i++) {
      const a = (i / clusters) * Math.PI * 2 + seededRandom(i) * 0.3;
      drawStem(a, 130 + seededRandom(i + 5) * 40, (seededRandom(i + 9) - 0.5) * 40);
      const bx = cx + Math.cos(a) * (ringR - 20);
      const by = cy + Math.sin(a) * (ringR - 20);
      drawPaintedLeaf(ctx, bx, by, a + 0.6, 34, FLORAL_PALETTE.leafGreenLight);
      drawPaintedLeaf(ctx, bx + Math.cos(a) * 40, by + Math.sin(a) * 40, a - 0.6, 26, FLORAL_PALETTE.leafGreenLight);
      drawPaintedFlower(ctx, bx + Math.cos(a) * 70, by + Math.sin(a) * 70, 16, i % 2 === 0 ? purple : purpleLight);
      drawPaintedFlower(ctx, bx - Math.cos(a) * 10, by - Math.sin(a) * 10, 10, purpleLight);
      drawTinyWhiteFlower(ctx, bx + Math.cos(a + 1) * 50, by + Math.sin(a + 1) * 50, 9);
    }

    for (let s = 0; s < 90; s++) {
      const a = seededRandom(s * 7) * Math.PI * 2;
      const rr = ringR - 60 + seededRandom(s * 7 + 1) * 140;
      const sx = cx + Math.cos(a) * rr;
      const sy = cy + Math.sin(a) * rr;
      ctx.fillStyle = sprinkles[s % sprinkles.length];
      ctx.beginPath();
      ctx.arc(sx, sy, 3 + seededRandom(s) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

// Side band: a handful of vine clusters trailing down from the top edge,
// wrapped seamlessly around the circumference, plus confetti sprinkles.
function useFloralSideTexture() {
  return useMemo(() => {
    const w = 2048;
    const h = 640;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const { purple, purpleLight, leafGreen, leafGreenLight, sprinkles } = FLORAL_PALETTE;

    function drawCluster(cxp: number) {
      const topY = 30 + seededRandom(cxp) * 20;
      const stemLen = 120 + seededRandom(cxp + 1) * 160;
      const midx = cxp + (seededRandom(cxp + 2) - 0.5) * 60;
      const endx = cxp + (seededRandom(cxp + 3) - 0.5) * 40;
      ctx.strokeStyle = leafGreen;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cxp, topY);
      ctx.quadraticCurveTo(midx, topY + stemLen * 0.6, endx, topY + stemLen);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        const lx = cxp + (midx - cxp) * t;
        const ly = topY + stemLen * t;
        drawPaintedLeaf(ctx, lx, ly, (seededRandom(cxp + i + 4) - 0.5) * 2.4, 30 + seededRandom(cxp + i) * 18, leafGreenLight);
      }
      drawPaintedFlower(ctx, cxp + (seededRandom(cxp + 9) - 0.5) * 30, topY + stemLen * 0.35, 20, seededRandom(cxp + 10) > 0.5 ? purple : purpleLight);
      drawPaintedFlower(ctx, cxp + (seededRandom(cxp + 11) - 0.5) * 40, topY + stemLen * 0.7, 15, purpleLight);
    }

    const clusterXs = [200, 620, 1080, 1500, 1900];
    clusterXs.forEach((x) => {
      drawCluster(x);
      drawCluster(x - w); // wrap seam on the left
      drawCluster(x + w); // wrap seam on the right
    });

    for (let s = 0; s < 140; s++) {
      const sx = seededRandom(s * 3) * w;
      const sy = 20 + seededRandom(s * 3 + 1) * (h - 40);
      ctx.fillStyle = sprinkles[s % sprinkles.length];
      ctx.beginPath();
      ctx.arc(sx, sy, 3 + seededRandom(s) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

// ─── Plain pale board (rounded square) ───────────────────────────────────

function useRoundedSquareBoardGeometry(sizeHalf = 1.55, radius = 0.14, depth = 0.045) {
  return useMemo(() => {
    const shape = new THREE.Shape();
    const s = sizeHalf;
    const r = radius;
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s);
    shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r);
    shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s);
    shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r);
    shape.quadraticCurveTo(-s, -s, -s + r, -s);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 2,
      curveSegments: 10,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, depth / 2, 0);
    return geo;
  }, [sizeHalf, radius, depth]);
}

// ─── Camera Rig ───────────────────────────────────────────────────────────────

function CameraRig({ progress }: { progress: number }) {
  const { camera } = useThree();
  const camPos = useRef(new THREE.Vector3(2.3, 2.7, 2.3));
  const lookAtTarget = useRef(new THREE.Vector3(0, 0.2, 0));

  useFrame(() => {
    const p = progress;
    const elev = THREE.MathUtils.lerp(42, 88, p) * (Math.PI / 180);
    const azim = THREE.MathUtils.lerp(45, 100, p) * (Math.PI / 180);
    const r = 4.6; // zoomed out slightly for comfortable framing

    const tx = r * Math.cos(elev) * Math.cos(azim);
    const ty = r * Math.sin(elev);
    const tz = r * Math.cos(elev) * Math.sin(azim);

    camPos.current.lerp({ x: tx, y: ty, z: tz } as THREE.Vector3, 0.12);
    camera.position.copy(camPos.current);
    camera.lookAt(lookAtTarget.current);
  });

  return null;
}

// ─── Flame ────────────────────────────────────────────────────────────────────
// A lathed teardrop with a real blue → orange → pale-yellow vertex gradient
// (self-lit, so it reads correctly under any lighting), plus a camera-facing
// additive sprite for the soft halo. Bloom (added on the Canvas) is what
// turns this into an actual glow rather than a flat bright shape.

function flameGeometry() {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.03, 0.01),
    new THREE.Vector2(0.042, 0.045),
    new THREE.Vector2(0.03, 0.09),
    new THREE.Vector2(0.012, 0.13),
    new THREE.Vector2(0.0, 0.155),
  ];
  const geo = new THREE.LatheGeometry(pts, 14);

  // Per-vertex gradient: hot blue base -> orange body -> warm white tip
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cBase = new THREE.Color("#60a5fa");
  const cMid = new THREE.Color("#fb923c");
  const cTip = new THREE.Color("#fff7ed");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / 0.155, 0, 1);
    const c = new THREE.Color();
    if (t < 0.3) c.lerpColors(cBase, cMid, t / 0.3);
    else c.lerpColors(cMid, cTip, (t - 0.3) / 0.7);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function Flame({
  color,
  isFinal,
  onBlow,
}: {
  color: string;
  isFinal: boolean;
  onBlow: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);
  const spriteRef = useRef<THREE.Sprite>(null!);
  const [hovered, setHovered] = useState(false);
  const geometry = useMemo(() => flameGeometry(), []);
  const glowTex = useGlowSpriteTexture();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      // gentle organic sway + flicker, two mismatched frequencies so it
      // never looks perfectly periodic
      groupRef.current.rotation.z = Math.sin(t * 6.1) * 0.06 + Math.sin(t * 2.3) * 0.03;
      groupRef.current.scale.setScalar(
        1 + Math.sin(t * 9.7) * 0.06 + Math.sin(t * 3.1) * 0.03
      );
    }
    if (spriteRef.current) {
      const flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 5) * 0.07;
      spriteRef.current.scale.setScalar(0.42 * flicker);
    }
  });

  return (
    <group position={[0, 0.22, 0]}>
      <group
        ref={groupRef}
        onClick={(e) => {
          e.stopPropagation();
          if (isFinal) onBlow();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (isFinal) setHovered(true);
          document.body.style.cursor = isFinal ? "pointer" : "default";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <mesh ref={meshRef} geometry={geometry}>
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={hovered ? 1 : 0.9}
          />
        </mesh>
        {/* larger, near-invisible hit target so tiny flames stay clickable */}
        <mesh visible={false}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshBasicMaterial />
        </mesh>
      </group>

      {/* Subtle camera-facing halo, tinted per-candle, soft ember glow */}
      <sprite ref={spriteRef} position={[0, 0.05, 0]} scale={0.22}>
        <spriteMaterial
          map={glowTex}
          color={color}
          transparent
          opacity={0.25}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

// ─── Candle ───────────────────────────────────────────────────────────────────

function Candle({
  position,
  color,
  blown,
  onBlow,
  isFinal,
}: {
  position: [number, number, number];
  color: string;
  blown: boolean;
  onBlow: () => void;
  isFinal: boolean;
}) {
  const stripeTex = useWaxStripeTexture(color);
  const smokeRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (blown && smokeRef.current) {
      const t = clock.getElapsedTime();
      smokeRef.current.position.y = 0.17 + (t % 1.5) * 0.03;
      const mat = smokeRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, 0.35 - (t % 1.5) * 0.2);
      smokeRef.current.scale.setScalar(1 + (t % 1.5) * 0.6);
    }
  });

  return (
    <group position={position}>
      {/* Body — subtle wax stripe texture instead of flat color */}
      <mesh castShadow>
        <cylinderGeometry args={[0.028, 0.03, 0.25, 20]} />
        <meshPhysicalMaterial
          map={stripeTex}
          color={color}
          roughness={0.35}
          clearcoat={0.4}
          clearcoatRoughness={0.4}
        />
      </mesh>
      {/* Melted wax pool at the rim */}
      <mesh position={[0, 0.126, 0]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[0.033, 12, 12]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.15}
          clearcoat={0.8}
          transmission={0.15}
        />
      </mesh>
      {/* Wick */}
      <mesh position={[0, 0.152, 0]}>
        <cylinderGeometry args={[0.0035, 0.0035, 0.045, 6]} />
        <meshStandardMaterial color="#1c1917" />
      </mesh>

      {!blown && (
        <pointLight
          color={color}
          intensity={0.45}
          distance={1.1}
          decay={2}
          position={[0, 0.28, 0]}
        />
      )}
      {!blown && <Flame color={color} isFinal={isFinal} onBlow={onBlow} />}

      {blown && (
        <mesh ref={smokeRef} position={[0, 0.17, 0]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial
            color="#9ca3af"
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

// ─── Ruffle border ──────────────────────────────────────────────────────────
// A continuous scalloped/wavy piped ruffle, built as a tube swept along a
// closed curve whose radius (and slightly its height) oscillates. Several
// offset strands layered together give the fuller, hand-piped ruffle look
// from the reference photo, at both the top rim and the base of the cake.

function ruffleCurvePoints(
  baseRadius: number,
  y: number,
  waveCount: number,
  amplitude: number,
  seedOffset: number,
  segments = 160
) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const r = baseRadius + Math.sin(a * waveCount + seedOffset) * amplitude;
    const yy = y + Math.cos(a * waveCount + seedOffset) * amplitude * 0.35;
    pts.push(new THREE.Vector3(Math.cos(a) * r, yy, Math.sin(a) * r));
  }
  return pts;
}

function RuffleStrand({
  baseRadius,
  y,
  waveCount,
  amplitude,
  tubeRadius,
  seedOffset = 0,
}: {
  baseRadius: number;
  y: number;
  waveCount: number;
  amplitude: number;
  tubeRadius: number;
  seedOffset?: number;
}) {
  const geometry = useMemo(() => {
    const pts = ruffleCurvePoints(baseRadius, y, waveCount, amplitude, seedOffset);
    const curve = new THREE.CatmullRomCurve3(pts, true);
    return new THREE.TubeGeometry(curve, 320, tubeRadius, 10, true);
  }, [baseRadius, y, waveCount, amplitude, tubeRadius, seedOffset]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        color="#fffdf9"
        roughness={0.3}
        clearcoat={0.55}
        clearcoatRoughness={0.35}
        sheen={0.6}
        sheenRoughness={0.4}
        sheenColor={new THREE.Color("#fff5ea")}
      />
    </mesh>
  );
}

type RuffleLayer = {
  waveCount: number;
  amplitude: number;
  tubeRadius: number;
  radiusOffset: number;
  yOffset: number;
  seed: number;
};

function RuffleBorder({
  baseRadius,
  y,
  layers,
}: {
  baseRadius: number;
  y: number;
  layers: RuffleLayer[];
}) {
  return (
    <group>
      {layers.map((l, i) => (
        <RuffleStrand
          key={i}
          baseRadius={baseRadius + l.radiusOffset}
          y={y + l.yOffset}
          waveCount={l.waveCount}
          amplitude={l.amplitude}
          tubeRadius={l.tubeRadius}
          seedOffset={l.seed}
        />
      ))}
    </group>
  );
}

// ─── Cake Model ───────────────────────────────────────────────────────────────

function CakeModel({
  blown,
  onBlow,
  isFinal,
}: {
  blown: boolean[];
  onBlow: (i: number) => void;
  isFinal: boolean;
}) {
  const creamTex = useSmoothCreamTexture();
  const floralTopTex = useFloralTopTexture();
  const floralSideTex = useFloralSideTexture();
  const woodBoardTex = useWoodBoardTexture();
  const boardGeo = useRoundedSquareBoardGeometry();

  const candlePositions = CANDLE_ANGLES_DEG.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return [
      Math.cos(rad) * CANDLE_RADIUS,
      TOP_Y + 0.125,
      Math.sin(rad) * CANDLE_RADIUS,
    ] as [number, number, number];
  });

  return (
    <group>
      {/* ── Textured light brown cake board ──────────────────── */}
      <mesh geometry={boardGeo} position={[0, -CAKE_HEIGHT / 2 - 0.06, 0]} receiveShadow castShadow>
        <meshStandardMaterial
          map={woodBoardTex}
          color="#b58a63"
          roughness={0.72}
          bumpMap={woodBoardTex}
          bumpScale={0.003}
        />
      </mesh>

      {/* ── Sponge body (smooth, matte white — reads as cake, not plastic) */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[CAKE_RADIUS, CAKE_RADIUS, CAKE_HEIGHT, 72]} />
        <meshPhysicalMaterial color="#fdfaf5" roughness={0.5} clearcoat={0.15} />
      </mesh>

      {/* ── Smooth, glossy top frosting layer — florals get painted on this */}
      <mesh position={[0, TOP_Y + 0.014, 0]} receiveShadow>
        <cylinderGeometry args={[CAKE_RADIUS - 0.01, CAKE_RADIUS - 0.01, 0.028, 96]} />
        <meshPhysicalMaterial
          color="#fffdfb"
          roughness={0.22}
          clearcoat={0.7}
          clearcoatRoughness={0.2}
          bumpMap={creamTex}
          bumpScale={0.006}
          sheen={0.5}
          sheenRoughness={0.3}
          sheenColor={new THREE.Color("#fff8ef")}
        />
      </mesh>

      {/* ── Painted floral wreath decal on top ─────── */}
      <mesh position={[0, TOP_Y + 0.0285, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[CAKE_RADIUS - 0.015, 96]} />
        <meshStandardMaterial
          map={floralTopTex}
          transparent
          depthWrite={false}
          roughness={0.5}
        />
      </mesh>

      {/* ── Painted floral vines wrapping the upper sides ──── */}
      <mesh position={[0, TOP_Y - 0.18, 0]}>
        <cylinderGeometry args={[CAKE_RADIUS + 0.003, CAKE_RADIUS + 0.003, 0.42, 72, 1, true]} />
        <meshStandardMaterial
          map={floralSideTex}
          transparent
          depthWrite={false}
          roughness={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Layered ruffled border around the top rim ──────── */}
      <RuffleBorder
        baseRadius={CAKE_RADIUS - 0.02}
        y={TOP_Y + 0.03}
        layers={[
          { waveCount: 26, amplitude: 0.045, tubeRadius: 0.028, radiusOffset: 0, yOffset: 0, seed: 0 },
          { waveCount: 22, amplitude: 0.05, tubeRadius: 0.024, radiusOffset: 0.035, yOffset: -0.012, seed: 1.7 },
        ]}
      />

      {/* ── Layered ruffled border around the base ─────────── */}
      <RuffleBorder
        baseRadius={CAKE_RADIUS + 0.02}
        y={-CAKE_HEIGHT / 2 + 0.03}
        layers={[
          { waveCount: 26, amplitude: 0.045, tubeRadius: 0.03, radiusOffset: 0, yOffset: 0, seed: 3.1 },
          { waveCount: 22, amplitude: 0.05, tubeRadius: 0.026, radiusOffset: 0.035, yOffset: 0.014, seed: 4.6 },
        ]}
      />

      {/* ── Candles ────────────────────────────────── */}
      {candlePositions.map((pos, i) => (
        <Candle
          key={i}
          position={pos}
          color={CANDLE_COLORS[i]}
          blown={blown[i]}
          onBlow={() => onBlow(i)}
          isFinal={isFinal}
        />
      ))}
    </group>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function CakeScene({
  setMorph,
}: {
  setMorph: (v: boolean) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null!);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [blown, setBlown] = useState([false, false, false, false, false]);

  const isFinal = scrollProgress > 0.91;
  const hasStarted = scrollProgress > 0.025;
  const allBlown = blown.every(Boolean);

  const [activeWishIndex, setActiveWishIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const handler = () => {
      const max = el.scrollHeight - el.clientHeight;
      setScrollProgress(max > 0 ? el.scrollTop / max : 0);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const handleBlow = (i: number) => {
    setBlown((prev) => {
      const next = [...prev];
      next[i] = true;
      return next;
    });
    setActiveWishIndex(i);
  };

  return (
    <div
      ref={scrollerRef}
      className="fixed inset-0 bg-black overflow-y-auto"
      style={{ scrollbarWidth: "none" }}
    >
      <style>{`::-webkit-scrollbar{display:none}`}</style>

      <button
        onClick={() => setMorph(false)}
        className="fixed top-5 left-5 z-50 px-4 py-2 rounded-full border border-white/10 text-white/35 hover:text-white hover:border-white/25 text-sm transition-all cursor-pointer backdrop-blur-sm"
      >
        ← Back
      </button>

      <div
        className="fixed right-7 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2.5 pointer-events-none select-none"
        style={{ opacity: isFinal ? 0 : 1, transition: "opacity 0.5s" }}
      >
        <span className="text-white/30 text-[16px] tracking-[0.4em] uppercase [writing-mode:vertical-rl]">
          Scroll Down
        </span>
        <motion.div
          animate={{ y: [0, 7, 0] }}
          transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
          className="text-white/20 text-2xl"
        >
          ↓
        </motion.div>
      </div>

      {/* ── Center Pop-up Modal with Blurred Backdrop ─────────── */}
      <AnimatePresence>
        {activeWishIndex !== null && (
          <motion.div
            key="wish-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
            onClick={() => setActiveWishIndex(null)}
          >
            <motion.div
              key={`wish-card-${activeWishIndex}`}
              initial={{ opacity: 0, scale: 0.88, y: 25 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="relative max-w-lg w-full bg-neutral-900/85 border border-white/15 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-2xl text-center flex flex-col items-center gap-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Colored glowing candle pill indicator */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: CANDLE_COLORS[activeWishIndex],
                    boxShadow: `0 0 12px 2px ${CANDLE_COLORS[activeWishIndex]}aa`,
                  }}
                />
                <span className="text-white/50 text-xs font-mono tracking-wider uppercase">
                  Candle
                </span>
              </div>

              {/* Wish text content */}
              <p className="text-white/90 text-lg sm:text-2xl font-light leading-relaxed">
                "{WISHES[activeWishIndex]}"
              </p>

              {/* Action button */}
              <button
                onClick={() => setActiveWishIndex(null)}
                className="mt-2 px-8 py-3 rounded-full bg-white text-neutral-900 font-medium hover:bg-neutral-200 transition-all active:scale-95 cursor-pointer shadow-lg hover:shadow-white/20"
              >
                {allBlown ? "View cake" : "Blow another candle"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ height: "380vh" }}>
        <div className="sticky top-0 h-screen">
          <Canvas
            className="absolute inset-0"
            camera={{ position: [2.3, 2.7, 2.3], fov: 45, near: 0.1, far: 100 }}
            dpr={[1, 2]}
            gl={{ antialias: true }}
            shadows
          >
            <ambientLight intensity={0.45} />
            <directionalLight
              position={[4, 6, 3]}
              intensity={1.5}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
              shadow-camera-left={-2}
              shadow-camera-right={2}
              shadow-camera-top={2}
              shadow-camera-bottom={-2}
            />
            <directionalLight position={[-3, 4, -2]} intensity={0.45} color="#ffe8d6" />
            {/* Rim light so the frosting edge separates from the black bg */}
            <directionalLight position={[-2, 1.5, -3.5]} intensity={0.6} color="#7dd3fc" />
            <pointLight position={[0, -2, 0]} intensity={0.15} color="#ffffff" />

            <CameraRig progress={scrollProgress} />

            <Suspense fallback={null}>
              <CakeModel blown={blown} onBlow={handleBlow} isFinal={isFinal} />
              <ContactShadows
                position={[0, -CAKE_HEIGHT / 2 - 0.08, 0]}
                opacity={0.55}
                scale={4}
                blur={2.2}
                far={1.2}
              />
            </Suspense>

            <EffectComposer>
              <Bloom
                intensity={0.45}
                luminanceThreshold={0.7}
                luminanceSmoothing={0.3}
                mipmapBlur
              />
              <Vignette eskil={false} offset={0.15} darkness={0.7} />
            </EffectComposer>
          </Canvas>

          <div
            className="absolute inset-x-0 top-14 flex justify-center pointer-events-none"
            style={{ opacity: hasStarted ? 0 : 1, transition: "opacity 0.7s" }}
          >
            <h1
              className="text-white text-center tracking-tight drop-shadow-lg"
              style={{
                fontFamily: "'Abril Fatface', cursive",
                fontSize: "clamp(1.6rem, 4vw, 2.8rem)",
              }}
            >
              Here is your cake.
            </h1>
          </div>

          <div
            className="absolute inset-x-0 bottom-16 flex justify-center pointer-events-none"
            style={{ opacity: isFinal ? 1 : 0, transition: "opacity 0.8s" }}
          >
            <AnimatePresence mode="wait">
              {!allBlown ? (
                <motion.p
                  key="prompt"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.5 }}
                  className="text-white/80 text-center"
                  style={{
                    fontFamily: "'Abril Fatface', cursive",
                    fontSize: "clamp(1rem, 2.2vw, 1.5rem)",
                  }}
                >
                  Blow the candle to see the wishes. Click on them.
                </motion.p>
              ) : (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="text-center flex flex-col gap-1"
                >
                  <p className="text-white/80 text-xs">
                    Happy 20th Birthday Zoya — the world is a better place with you in it.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isFinal && (
            <div className="absolute right-5 bottom-5 text-white/25 text-xs tracking-widest pointer-events-none">
              {blown.filter(Boolean).length} / 5 wishes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
