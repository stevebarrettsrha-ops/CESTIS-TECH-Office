import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Outlines } from '@react-three/drei';
import type { Agent } from '../store';
import { isLightColor } from '../../../shared/brand';
import { ACCENTS, appearanceFor } from './appearance';
import { PARTS } from './characterParts';
import { useCanvasTexture } from './interact';
import { mix, shade, toon } from './materials';
import { Bubble, useHitReaction } from './useHitReaction';
import { HIGH_FIVE_MS, onHighFive } from './staffFun';
import { backPrintTexture, chestLogoTexture, drawBadge, shirtTrim, staffShirt } from './uniform';
import { boop } from '../ui/sfx';

// A seated cartoon person. Origin is the floor under the chair; they face -Z (toward the desk).
// Hired staff wear the C.E.S.T.I.S uniform (logo polo + name badge); candidates in the waiting room wear their own clothes.

type Arm = { pitch: number; yaw: number }; // yaw > 0 swings the hand toward the body's centre line
type Brows = { lift: number; tilt: number }; // tilt > 0 = worried (inner ends up), < 0 = cross
type Pose = { l: Arm; r: Arm; lean: number; headPitch: number; headYaw: number; type: number; mouse: number; brow: Brows };
type PoseName = 'typing' | 'browsing' | 'thinking' | 'relaxed' | 'cheer' | 'slump';

const KEYS: Arm = { pitch: -0.34, yaw: 0.26 };
const CALM: Brows = { lift: 0, tilt: 0 };
const POSES: Record<PoseName, Pose> = {
  typing: { l: KEYS, r: KEYS, lean: 0.1, headPitch: -0.02, headYaw: 0, type: 1, mouse: 0, brow: { lift: -0.004, tilt: -0.12 } },
  browsing: { l: KEYS, r: { pitch: -0.4, yaw: -0.22 }, lean: 0.06, headPitch: 0.05, headYaw: 0.04, type: 0.25, mouse: 1, brow: { lift: 0.008, tilt: 0 } },
  // Arm pitch rotates the arm (which points along -Z) up from horizontal: 0 = straight ahead, +PI/2 = straight up.
  // The poses below are chosen so hands never pass through the head.
  thinking: { l: KEYS, r: { pitch: 0.4, yaw: 0.9 }, lean: 0.02, headPitch: 0.1, headYaw: -0.12, type: 0.3, mouse: 0, brow: { lift: 0.014, tilt: 0.25 } }, // hand under the chin
  relaxed: { l: { pitch: -0.9, yaw: 0.35 }, r: { pitch: -0.9, yaw: 0.35 }, lean: -0.1, headPitch: 0.06, headYaw: 0, type: 0, mouse: 0, brow: CALM }, // hands in the lap
  cheer: { l: { pitch: 1.45, yaw: -0.35 }, r: { pitch: 1.45, yaw: -0.35 }, lean: -0.05, headPitch: 0.2, headYaw: 0, type: 0, mouse: 0, brow: { lift: 0.025, tilt: 0 } }, // arms up in a V
  slump: { l: { pitch: -1.35, yaw: -0.15 }, r: { pitch: -1.35, yaw: -0.15 }, lean: 0.25, headPitch: -0.45, headYaw: 0, type: 0, mouse: 0, brow: { lift: 0.006, tilt: 0.45 } }, // arms dangling
};

const clone = (p: Pose): Pose => ({ ...p, l: { ...p.l }, r: { ...p.r }, brow: { ...p.brow } });
const INK = '#1f1d2b';
const HEAD_SCALE = 1.18; // a big cartoon head
const GLASSES_SCALE: [number, number, number] = [1.22, 1.28, 1.02]; // frames wide enough for the big eyes
// Glasses frames, picked by the same accent index as hats and stripes.
const FRAMES = ['#1f1d2b', '#7f5539', '#1f1d2b', '#c1121f', '#355070', '#1f1d2b'];

const printMats = new Map<string, THREE.MeshBasicMaterial>();
function printMaterial(key: string, map: THREE.Texture) {
  let m = printMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, color: '#ececec', polygonOffset: true, polygonOffsetFactor: -2 });
    printMats.set(key, m);
  }
  return m;
}

/** The clip-on name badge, with this person's name and role. */
function NameBadge({ agent }: { agent: Agent }) {
  const tex = useCanvasTexture(320, 240, (ctx) => drawBadge(ctx, 320, 240, agent), [agent.name, agent.role, agent.title, agent.id]);
  return (
    // wearer's right chest; turned to follow the curve of the torso
    <group position={[0.105, 0.37, -0.178]} rotation={[0.06, Math.PI - 0.55, 0]}>
      <mesh position={[0, 0.048, 0.004]} geometry={PARTS.badgeClip} material={toon('#adb5bd')} />
      <mesh>
        <planeGeometry args={[0.118, 0.0885]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Character({ agent, uniform = true }: { agent: Agent; uniform?: boolean }) {
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const browL = useRef<THREE.Mesh>(null);
  const browR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const cur = useRef<Pose>(clone(POSES.relaxed));
  const seed = useRef(Math.random() * 100);
  const lastTool = useRef({ name: null as string | null, at: 0 });
  const look = useMemo(() => appearanceFor(agent), [agent.id, agent.look, agent.role]);
  const root = useRef<THREE.Group>(null);
  const hit = useHitReaction(agent.id, root);
  const [five, setFive] = useState<{ text: string; since: number } | null>(null);
  if (agent.currentTool) lastTool.current = { name: agent.currentTool, at: performance.now() };

  useEffect(
    () =>
      onHighFive(agent.id, (text) => {
        boop();
        setFive({ text, since: performance.now() });
      }),
    [agent.id],
  );
  useEffect(() => {
    if (!five) return;
    const t = setTimeout(() => setFive(null), HIGH_FIVE_MS);
    return () => clearTimeout(t);
  }, [five]);

  useFrame((_, dt) => {
    const now = performance.now();
    const t = now / 1000 + seed.current;
    const busy = agent.status === 'working' || agent.status === 'preparing';
    const highFiving = five != null && now - five.since < HIGH_FIVE_MS;
    const cheering = highFiving || (agent.status === 'done' && agent.endedAt != null && Date.now() - agent.endedAt < 7000);
    // A little hysteresis so poses don't flicker between quick tool calls.
    const sinceTool = now - lastTool.current.at;
    const browsing = lastTool.current.name?.startsWith('mcp__playwright') && sinceTool < 4000;
    const name: PoseName = cheering
      ? 'cheer'
      : busy
        ? agent.status === 'preparing'
          ? 'typing'
          : browsing
            ? 'browsing'
            : !agent.currentTool && sinceTool > 2500
              ? 'thinking'
              : 'typing'
        : agent.status === 'error'
          ? 'slump'
          : 'relaxed';
    const target = POSES[name];
    const c = cur.current;
    const k = 1 - Math.exp(-dt * (highFiving ? 10 : 5));
    for (const side of ['l', 'r'] as const) {
      c[side].pitch += (target[side].pitch - c[side].pitch) * k;
      c[side].yaw += (target[side].yaw - c[side].yaw) * k;
    }
    for (const key of ['lean', 'headPitch', 'headYaw', 'type', 'mouse'] as const) c[key] += (target[key] - c[key]) * k;
    c.brow.lift += (target.brow.lift - c.brow.lift) * k;
    c.brow.tilt += (target.brow.tilt - c.brow.tilt) * k;

    // Typing comes in bursts: fast alternating taps, then a short pause to read.
    const burst = Math.sin(t * 0.8) + Math.sin(t * 2.1) * 0.6 > -0.35 ? 1 : 0.15;
    const tap = c.type * burst * 0.1;
    const speed = agent.status === 'preparing' ? 10 : 19;
    const tapL = Math.max(0, Math.sin(t * speed)) * tap;
    const tapR = Math.max(0, Math.sin(t * speed + 2.4)) * tap * (1 - c.mouse);
    const driftL = Math.sin(t * 3.1) * 0.05 * c.type;
    const driftR = Math.sin(t * 2.7 + 1) * 0.05 * c.type;
    // Mouse hand: small glides plus a click now and then.
    const glide = Math.sin(t * 1.9) * 0.06 * c.mouse;
    const click = (Math.sin(t * 5.3) > 0.93 ? 0.04 : 0) * c.mouse;
    const wave = cheering ? Math.sin(t * (highFiving ? 14 : 9)) * 0.35 : 0;

    // Longer arms on taller people: tip them down a touch so hands still land on the keyboard.
    const reach = -(look.height - 1) * 0.55;
    // Hit by a toy: jolt back with hands up, then look at the player, laid over the pose above.
    const h = hit.pose(now);
    const jolt = h.flinch * 0.55;
    if (armL.current && armR.current) {
      armL.current.rotation.set(c.l.pitch + reach + tapL + jolt, -(c.l.yaw + driftL) + wave, 0);
      armR.current.rotation.set(c.r.pitch + reach + tapR - click + jolt, c.r.yaw + driftR * (1 - c.mouse) + glide - wave, 0);
    }
    // a happy bounce in the seat while cheering
    if (root.current) root.current.position.y = cheering ? Math.abs(Math.sin(t * 8)) * 0.05 : 0;
    if (torso.current) {
      torso.current.rotation.x = -c.lean + Math.sin(t * 1.6) * 0.015 + (busy ? Math.sin(t * 9) * 0.006 * burst : 0) + h.flinch * 0.2;
      torso.current.rotation.y = h.twist * h.w;
    }
    if (head.current) {
      // Every few seconds, glance down at the keyboard; while setting up, look around.
      const glance = busy && Math.sin(t * 0.55 + 2) > 0.92 ? -0.22 : 0;
      const gaze = agent.status === 'preparing' ? Math.sin(t * 1.3) * 0.5 : Math.sin(t * 0.4) * 0.08;
      const pitch = c.headPitch + glance + (busy ? Math.sin(t * 4.5) * 0.02 * burst : 0);
      const yaw = gaze + c.headYaw;
      const wobble = cheering ? Math.sin(t * 7) * 0.12 : name === 'thinking' ? 0.12 : 0;
      head.current.rotation.set(pitch + (h.headPitch - pitch) * h.w, yaw + (h.headYaw - yaw) * h.w, wobble * (1 - h.w));
    }
    // Blink every few seconds (a quick double now and then); wide-eyed when hit.
    if (eyes.current) {
      const cycle = (t * 1000) % 4200;
      const blink = cycle < 110 || (seed.current > 60 && cycle > 260 && cycle < 360) ? 0.12 : 1;
      eyes.current.scale.y = h.flinch > 0.1 ? 1.25 : blink;
    }
    const lift = c.brow.lift + h.flinch * 0.03;
    if (browL.current) {
      browL.current.position.y = 0.1 + lift;
      browL.current.rotation.z = -c.brow.tilt;
    }
    if (browR.current) {
      browR.current.position.y = 0.1 + lift;
      browR.current.rotation.z = c.brow.tilt;
    }
  });

  const skin = toon(agent.skin);
  const isQa = agent.role === 'qa';
  const isCeo = agent.role === 'ceo';
  const feminine = agent.look === 'feminine';
  const busy = agent.status === 'working' || agent.status === 'preparing';
  const shirtColor = uniform ? staffShirt(agent) : isQa ? '#f8f9fa' : isCeo ? '#2b2d42' : agent.color;
  const trim = shirtTrim(shirtColor);
  const shirt = toon(shirtColor);
  const hair = toon(look.hair === 'buzz' ? mix(agent.hair, agent.skin, 0.35) : agent.hair);
  const dark = toon(INK);
  const white = toon('#ffffff');
  const accent = ACCENTS[look.accent];
  const sad = agent.status === 'error';
  const cheering = five != null || (agent.status === 'done' && agent.endedAt != null && Date.now() - agent.endedAt < 7000);
  const hairGeo = PARTS.hair[look.hair];
  const facialGeo = PARTS.facialHair[look.facialHair];
  const glassesGeo = PARTS.glasses[look.glasses];
  const hatGeo = PARTS.headwear[look.headwear];
  const outfit = PARTS.outfit[look.outfit];
  const casual = !uniform && !isQa && !isCeo;
  const outlinedHair = look.hair !== 'buzz' && look.hair !== 'bald';
  const clip = feminine && look.headwear === 'none' && ['long', 'ponytail', 'bun', 'sidePart', 'curls'].includes(look.hair);
  const phones = look.headphones && (
    <>
      <mesh geometry={PARTS.headphones.shell} material={toon('#2b2d42')} castShadow />
      <mesh geometry={PARTS.headphones.covers} material={toon(shade(shirtColor, 0.12))} />
    </>
  );
  const light = isLightColor(shirtColor);

  return (
    <group ref={root}>
      {hit.bubble}
      {five && <Bubble key={five.since} text={five.text} since={five.since} ms={HIGH_FIVE_MS} color="#004aad" />}
      {/* legs never move, so both are one mesh */}
      <mesh geometry={PARTS.legs} material={toon(uniform ? '#2f3b55' : '#3d4a6b')} castShadow>
        <Outlines thickness={0.012} color={INK} angle={0} />
      </mesh>
      <mesh geometry={PARTS.bigShoes} material={dark} castShadow>
        <Outlines thickness={0.01} color={INK} angle={0} />
      </mesh>

      {/* taller people sit a touch further forward so their back stays clear of the chair */}
      <group ref={torso} position={[0, 0.5, -(look.height - 1) * 0.25]} scale={look.height}>
        <group scale={[look.shoulders, 1, 1]}>
          <mesh position={[0, 0.3, 0]} geometry={PARTS.torso} material={shirt} castShadow>
            <Outlines thickness={0.015} color={INK} angle={0} />
          </mesh>
          {uniform ? (
            <>
              {/* the C.E.S.T.I.S polo: contrast collar, button placket, chest logo, back print and name badge */}
              <mesh position={[0, 0.5, -0.02]} rotation={[Math.PI / 2, 0, 0]} geometry={PARTS.collar} material={toon(trim)} />
              <mesh position={[0, 0.43, -0.19]} rotation={[-0.25, 0, 0]} geometry={PARTS.placket} material={toon(shade(shirtColor, light ? -0.1 : 0.1))} />
              <mesh position={[0, 0.43, -0.19]} rotation={[-0.25, 0, 0]} geometry={PARTS.buttons} material={white} />
              <mesh position={[0, 0.385, 0]} geometry={PARTS.chestLogo} material={printMaterial('chest', chestLogoTexture())} />
              <mesh position={[0, 0.33, 0]} geometry={PARTS.backPrint} material={printMaterial(`back-${light}`, backPrintTexture(light))} />
              <NameBadge agent={agent} />
            </>
          ) : (
            <>
              {look.outfit !== 'sweater' && (
                <mesh position={[0, 0.5, -0.02]} rotation={[Math.PI / 2, 0, 0]} geometry={PARTS.collar} material={toon(isCeo ? '#f8f9fa' : shade(agent.color, -0.15))} />
              )}
              {casual && outfit.main && <mesh geometry={outfit.main} material={toon(shade(agent.color, -0.08))} castShadow />}
              {casual && outfit.trim && (
                <mesh geometry={outfit.trim} material={toon(look.outfit === 'stripe' ? accent : look.outfit === 'hoodie' ? '#f8f9fa' : shade(agent.color, -0.14))} />
              )}
              {isCeo && (
                <>
                  <mesh position={[0, 0.36, -0.192]} geometry={PARTS.shirtFront} material={toon('#f8f9fa')} />
                  <mesh position={[0, 0.33, -0.206]} geometry={PARTS.tie} material={toon(agent.color)} />
                  <mesh position={[0, 0.445, -0.206]} geometry={PARTS.tieKnot} material={toon(shade(agent.color, -0.2))} />
                </>
              )}
              {isQa && (
                <>
                  <mesh position={[0, 0.27, -0.196]} geometry={PARTS.coatOpening} material={toon(agent.color)} />
                  <mesh position={[0.1, 0.38, -0.19]} rotation={[0.1, 0, 0]} geometry={PARTS.badge} material={toon('#ffd166')} />
                </>
              )}
            </>
          )}
          {!busy && phones && (
            // resting around the neck
            <group position={[0, 0.49, -0.09]} rotation={[Math.PI / 2 - 0.5, 0, 0]} scale={0.74}>
              {phones}
            </group>
          )}
        </group>

        {/* arms pivot at the shoulders */}
        {[
          { ref: armL, x: -0.25 },
          { ref: armR, x: 0.25 },
        ].map(({ ref, x }) => (
          <group key={x} ref={ref} position={[x * look.shoulders, 0.44, 0]}>
            <mesh position={[0, 0, -0.24]} rotation={[Math.PI / 2, 0, 0]} geometry={PARTS.sleeve} material={shirt} castShadow>
              <Outlines thickness={0.012} color={INK} angle={0} />
            </mesh>
            {uniform && <mesh position={[0, 0, -0.39]} rotation={[Math.PI / 2, 0, 0]} scale={[1.1, 0.12, 1.1]} geometry={PARTS.sleeve} material={toon(trim)} />}
            <mesh position={[0, 0, -0.5]} geometry={PARTS.mitten} material={skin} castShadow>
              <Outlines thickness={0.01} color={INK} angle={0} />
            </mesh>
          </group>
        ))}

        <group ref={head} position={[0, 0.69, 0]} scale={HEAD_SCALE}>
          <mesh geometry={PARTS.head} material={skin} castShadow>
            <Outlines thickness={0.013} color={INK} angle={0} />
          </mesh>
          {hairGeo && (
            <mesh geometry={hairGeo} material={hair} castShadow={outlinedHair}>
              {outlinedHair && <Outlines thickness={0.01} color={INK} angle={0} />}
            </mesh>
          )}
          <mesh geometry={PARTS.ears} material={skin} />
          {/* big round eyes that blink */}
          <group ref={eyes} position={[0, 0.03, 0]}>
            <mesh geometry={PARTS.eyeWhites} material={white}>
              <Outlines thickness={0.006} color={INK} angle={0} />
            </mesh>
            <mesh geometry={PARTS.pupils} material={dark} />
            <mesh geometry={PARTS.shines} material={white} />
          </group>
          <mesh ref={browL} position={[-0.08, 0.1, -0.158]} geometry={PARTS.brow} material={toon(shade(agent.hair, -0.1))} />
          <mesh ref={browR} position={[0.08, 0.1, -0.158]} geometry={PARTS.brow} material={toon(shade(agent.hair, -0.1))} />
          <mesh position={[0, -0.035, -0.205]} geometry={PARTS.nose} material={toon(shade(agent.skin, -0.08))} />
          {cheering ? (
            <>
              <mesh position={[0, -0.095, -0.178]} geometry={PARTS.mouthOpen} material={toon('#5a1a2a')} />
              <mesh position={[0, -0.112, -0.188]} geometry={PARTS.tongue} material={toon('#ff7b8a')} />
            </>
          ) : (
            <mesh position={[0, sad ? -0.115 : -0.09, -0.175]} rotation={[0.25, 0, sad ? 0 : Math.PI]} scale={1.15} geometry={PARTS.mouth} material={dark} />
          )}
          {facialGeo && <mesh geometry={facialGeo} material={toon(look.facialHair === 'stubble' ? mix(agent.skin, agent.hair, 0.3) : agent.hair)} />}
          <mesh geometry={PARTS.blush} material={toon(feminine ? '#ff8fa3' : '#f4a6a6', { opacity: 0.85 })} />
          {feminine && <mesh geometry={PARTS.bigLashes} material={dark} />}
          {clip && (
            <mesh position={[0.15, 0.13, -0.08]} rotation={[0, 0, 0.5]} geometry={PARTS.hairClip} material={toon(isQa ? '#ff9f68' : shade(shirtColor, 0.15))} />
          )}
          {/* QA's round inspector glasses stay part of the uniform */}
          {isQa && <mesh geometry={PARTS.inspectorGlasses} material={dark} scale={GLASSES_SCALE} />}
          {glassesGeo && <mesh geometry={glassesGeo} material={toon(FRAMES[look.accent])} scale={GLASSES_SCALE} />}
          {hatGeo && (
            <mesh geometry={hatGeo} material={toon(uniform ? (look.accent % 2 ? '#e72b28' : '#004aad') : look.accent === 0 ? shade(agent.color, -0.2) : accent)} castShadow>
              <Outlines thickness={0.012} color={INK} angle={0} />
            </mesh>
          )}
          {busy && phones}
        </group>
      </group>
    </group>
  );
}
