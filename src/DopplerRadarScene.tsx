import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Representative model of a radome-housed X-band dual-polarisation Doppler weather radar: lattice tower,
 * platform, foam-sandwich spherical radome and equipment shelter, with the antenna inside scanning the
 * 11-elevation volume strategy. Proportions are illustrative, not surveyed from the Mahabaleshwar site.
 */

export const SCAN_ELEVATIONS = [0.5, 1, 1.5, 3, 6, 9, 12, 30, 45, 60, 89];
const TOWER_H = 4.2;
const RADOME_R = 1.55;
const RADOME_CENTER_Y = TOWER_H + 1.6;
const SECONDS_PER_SWEEP = 3.2; // visual pace; the real radar takes ~30 s per sweep
const PULSE_MS = 2400;

const STEEL = { color: '#9aa8a3', metalness: 0.65, roughness: 0.38 };

function Rod({
  start,
  end,
  radius = 0.03,
  color = STEEL.color,
}: {
  start: number[];
  end: number[];
  radius?: number;
  color?: string;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...start),
      b = new THREE.Vector3(...end);
    const dir = b.clone().sub(a);
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      ),
      length: dir.length(),
    };
  }, [start, end]);
  return (
    <mesh position={position} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, length, 6]} />
      <meshStandardMaterial color={color} metalness={STEEL.metalness} roughness={STEEL.roughness} />
    </mesh>
  );
}

/** Four-legged tapered lattice tower with X bracing and a ladder. */
function Tower() {
  const rods = useMemo(() => {
    const out: { s: number[]; e: number[]; r?: number }[] = [];
    const half = (y: number) => 1.05 - (y / TOWER_H) * 0.35;
    const corners = (y: number) => {
      const h = half(y);
      return [
        [h, y, h],
        [-h, y, h],
        [-h, y, -h],
        [h, y, -h],
      ];
    };
    const levels = [0, 1.05, 2.1, 3.15, TOWER_H];
    for (let c = 0; c < 4; c++) out.push({ s: corners(0)[c], e: corners(TOWER_H)[c], r: 0.055 });
    for (let l = 0; l < levels.length - 1; l++) {
      const lo = corners(levels[l]),
        hi = corners(levels[l + 1]);
      for (let c = 0; c < 4; c++) {
        const n = (c + 1) % 4;
        out.push(
          { s: lo[c], e: hi[n], r: 0.022 },
          { s: lo[n], e: hi[c], r: 0.022 },
          { s: hi[c], e: hi[n], r: 0.028 },
        );
      }
    }
    // Ladder on the +z face
    const zl = (y: number) => half(y) + 0.06;
    out.push(
      { s: [-0.18, 0, zl(0)], e: [-0.18, TOWER_H, zl(TOWER_H)], r: 0.02 },
      { s: [0.18, 0, zl(0)], e: [0.18, TOWER_H, zl(TOWER_H)], r: 0.02 },
    );
    for (let y = 0.3; y < TOWER_H; y += 0.3)
      out.push({ s: [-0.18, y, zl(y)], e: [0.18, y, zl(y)], r: 0.014 });
    return out;
  }, []);
  return (
    <group>
      {rods.map((r, i) => (
        <Rod key={i} start={r.s} end={r.e} radius={r.r} />
      ))}
      {[
        [1.05, 1.05],
        [-1.05, 1.05],
        [-1.05, -1.05],
        [1.05, -1.05],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.08, z]} castShadow receiveShadow>
          <boxGeometry args={[0.38, 0.16, 0.38]} />
          <meshStandardMaterial color="#c9cfc8" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Square grated platform with railing at the tower top. */
function Platform() {
  const posts = useMemo(() => {
    const out: number[][] = [];
    for (let i = -4; i <= 4; i++) {
      const t = (i / 4) * 1.1;
      out.push([t, 1.12], [t, -1.12], [1.12, t], [-1.12, t]);
    }
    return out;
  }, []);
  const y = TOWER_H;
  return (
    <group>
      <mesh position={[0, y + 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.36, 0.1, 2.36]} />
        <meshStandardMaterial color="#b4bfba" metalness={0.4} roughness={0.55} />
      </mesh>
      {posts.map(([x, z], i) => (
        <Rod key={i} start={[x, y + 0.1, z]} end={[x, y + 0.75, z]} radius={0.016} />
      ))}
      {[0.45, 0.75].map((h) => (
        <group key={h}>
          <Rod start={[-1.12, y + h, 1.12]} end={[1.12, y + h, 1.12]} radius={0.02} />
          <Rod start={[-1.12, y + h, -1.12]} end={[1.12, y + h, -1.12]} radius={0.02} />
          <Rod start={[1.12, y + h, -1.12]} end={[1.12, y + h, 1.12]} radius={0.02} />
          <Rod start={[-1.12, y + h, -1.12]} end={[-1.12, y + h, 1.12]} radius={0.02} />
        </group>
      ))}
    </group>
  );
}

/** Parabolic reflector facing +z with feed support struts. */
function Dish({ radius = 1.05 }: { radius?: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry(),
      pts: number[] = [],
      idx: number[] = [];
    const rings = 20,
      slices = 72,
      k = 0.3 / radius;
    for (let j = 0; j <= rings; j++)
      for (let i = 0; i <= slices; i++) {
        const r = (j / rings) * radius,
          t = (i / slices) * Math.PI * 2;
        pts.push(Math.cos(t) * r, Math.sin(t) * r, r * r * k);
      }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < slices; i++) {
        const a = j * (slices + 1) + i,
          b = a + slices + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [radius]);
  const rim = radius * radius * (0.3 / radius);
  return (
    <group>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial color="#e8ece8" side={THREE.DoubleSide} metalness={0.35} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, rim]}>
        <torusGeometry args={[radius, 0.025, 8, 72]} />
        <meshStandardMaterial color="#aeb9b4" metalness={0.6} roughness={0.3} />
      </mesh>
      {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((t) => (
        <Rod
          key={t}
          start={[Math.cos(t) * radius * 0.92, Math.sin(t) * radius * 0.92, rim * 0.9]}
          end={[0, 0, 0.78]}
          radius={0.016}
          color="#8a9a95"
        />
      ))}
      {/* Dual-polarisation feed horn */}
      <mesh position={[0, 0, 0.82]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 0.18, 4]} />
        <meshStandardMaterial color="#3f5654" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, -0.12]}>
        <boxGeometry args={[0.42, 0.42, 0.2]} />
        <meshStandardMaterial color="#7d8f8a" metalness={0.5} roughness={0.45} />
      </mesh>
    </group>
  );
}

/** Equipment shelter beside the tower: walls, roof, door, air-conditioner and cable tray. */
function Shelter() {
  return (
    <group position={[-2.9, 0, 1.5]} rotation={[0, 0.35, 0]}>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 2.2, 1.7]} />
        <meshStandardMaterial color="#e3e7e1" roughness={0.85} />
      </mesh>
      <mesh position={[0, 2.26, 0]} castShadow>
        <boxGeometry args={[2.8, 0.12, 1.9]} />
        <meshStandardMaterial color="#b9c2bc" roughness={0.7} />
      </mesh>
      <mesh position={[0.55, 0.9, 0.86]}>
        <boxGeometry args={[0.62, 1.6, 0.04]} />
        <meshStandardMaterial color="#5f7470" roughness={0.6} />
      </mesh>
      <mesh position={[-0.6, 1.45, 0.86]}>
        <boxGeometry args={[0.7, 0.42, 0.03]} />
        <meshStandardMaterial color="#9fb7bb" metalness={0.3} roughness={0.2} />
      </mesh>
      <mesh position={[-1.38, 1.3, 0.2]} castShadow>
        <boxGeometry args={[0.2, 0.6, 0.8]} />
        <meshStandardMaterial color="#cfd5cf" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Radar({
  rotation,
  pulse,
  xray,
  still,
  dark,
  onElevation,
}: {
  rotation: React.RefObject<number>;
  pulse: React.RefObject<number>;
  xray: boolean;
  still: boolean;
  dark: boolean;
  onElevation?: (deg: number) => void;
}) {
  const root = useRef<THREE.Group>(null),
    azimuth = useRef<THREE.Group>(null),
    elevation = useRef<THREE.Group>(null),
    radome = useRef<THREE.MeshStandardMaterial>(null),
    seams = useRef<THREE.LineBasicMaterial>(null),
    beam = useRef<THREE.MeshBasicMaterial>(null),
    rings = useRef<(THREE.Mesh | null)[]>([]),
    lastElevation = useRef(-1),
    fade = useRef(xray ? 1 : 0);
  const invalidate = useThree((s) => s.invalidate);

  const radomeGeometry = useMemo(
    () => new THREE.SphereGeometry(RADOME_R, 72, 48, 0, Math.PI * 2, 0, Math.PI * 0.8),
    [],
  );
  // Faint panel seams of the foam-sandwich radome: meridians and two latitude bands.
  const seamGeometry = useMemo(() => {
    const pts: number[] = [];
    const R = RADOME_R + 0.004;
    for (let m = 0; m < 10; m++) {
      const phi = (m / 10) * Math.PI * 2;
      for (let i = 0; i < 40; i++) {
        const t0 = (i / 40) * Math.PI * 0.8,
          t1 = ((i + 1) / 40) * Math.PI * 0.8;
        pts.push(R * Math.sin(t0) * Math.cos(phi), R * Math.cos(t0), R * Math.sin(t0) * Math.sin(phi));
        pts.push(R * Math.sin(t1) * Math.cos(phi), R * Math.cos(t1), R * Math.sin(t1) * Math.sin(phi));
      }
    }
    for (const theta of [Math.PI * 0.28, Math.PI * 0.55]) {
      for (let i = 0; i < 96; i++) {
        const p0 = (i / 96) * Math.PI * 2,
          p1 = ((i + 1) / 96) * Math.PI * 2;
        pts.push(R * Math.sin(theta) * Math.cos(p0), R * Math.cos(theta), R * Math.sin(theta) * Math.sin(p0));
        pts.push(R * Math.sin(theta) * Math.cos(p1), R * Math.cos(theta), R * Math.sin(theta) * Math.sin(p1));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  useLayoutEffect(() => invalidate(), [xray, invalidate]);

  useFrame(({ clock }, delta) => {
    const t = still ? 0.6 : clock.getElapsedTime();
    if (root.current) root.current.rotation.y = -0.35 + rotation.current;
    // Volume scan: one full rotation per sweep, stepping through the elevation list.
    const sweep = Math.floor(t / SECONDS_PER_SWEEP) % SCAN_ELEVATIONS.length;
    const az = ((t % SECONDS_PER_SWEEP) / SECONDS_PER_SWEEP) * Math.PI * 2;
    const el = SCAN_ELEVATIONS[sweep];
    if (azimuth.current) azimuth.current.rotation.y = still ? 0.9 : -az;
    if (elevation.current) {
      const target = THREE.MathUtils.degToRad(still ? 6 : el);
      elevation.current.rotation.x = THREE.MathUtils.lerp(
        elevation.current.rotation.x,
        -target,
        still ? 1 : Math.min(1, delta * 6),
      );
    }
    if (!still && el !== lastElevation.current) {
      lastElevation.current = el;
      onElevation?.(el);
    }
    // Radome transparency eases between solid and x-ray.
    fade.current = THREE.MathUtils.lerp(fade.current, xray ? 1 : 0, still ? 1 : Math.min(1, delta * 4));
    if (radome.current) {
      radome.current.opacity = 1 - fade.current * 0.82;
      radome.current.transparent = fade.current > 0.01;
      radome.current.depthWrite = fade.current < 0.01;
    }
    if (seams.current) seams.current.opacity = 0.16 + fade.current * 0.25;
    // Pulse: beam flash plus staggered ground wavefronts.
    const age = (performance.now() - pulse.current) / PULSE_MS,
      live = age >= 0 && age < 1;
    if (beam.current)
      beam.current.opacity =
        (xray ? 0.22 : 0.1) + (live ? Math.sin(Math.min(1, age * 3) * Math.PI) * 0.35 : 0);
    rings.current.forEach((ring, k) => {
      if (!ring) return;
      const a = age - k * 0.16,
        on = live && a >= 0 && a < 0.84;
      ring.visible = on;
      if (!on) return;
      const p = a / 0.84;
      ring.scale.setScalar(0.6 + p * 10);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - p) * (0.9 - k * 0.2);
    });
    if (still && !live && Math.abs(fade.current - (xray ? 1 : 0)) < 0.01) return;
    invalidate();
  });

  return (
    <>
      <group ref={root}>
        <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[4.4, 6]} />
          <meshStandardMaterial color={dark ? '#2a3b3f' : '#d3d9d2'} roughness={0.95} />
        </mesh>
        <Tower />
        <Platform />
        <Shelter />
        <Rod start={[-1.6, 2.0, 0.9]} end={[-0.75, 3.9, 0.4]} radius={0.05} color="#7f8f8a" />
        {/* Radome base ring */}
        <mesh position={[0, TOWER_H + 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.98, 1.05, 0.28, 48]} />
          <meshStandardMaterial color="#c6cec9" metalness={0.3} roughness={0.55} />
        </mesh>
        <group position={[0, RADOME_CENTER_Y, 0]}>
          <mesh geometry={radomeGeometry} castShadow renderOrder={2}>
            <meshStandardMaterial
              ref={radome}
              color="#f4f6f3"
              roughness={0.55}
              metalness={0.05}
              side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments geometry={seamGeometry} renderOrder={3}>
            <lineBasicMaterial ref={seams} color="#8fa09b" transparent opacity={0.16} depthWrite={false} />
          </lineSegments>
          {/* Pedestal and antenna inside the radome */}
          <mesh position={[0, -0.85, 0]}>
            <cylinderGeometry args={[0.24, 0.32, 0.75, 20]} />
            <meshStandardMaterial color="#6f817c" metalness={0.55} roughness={0.4} />
          </mesh>
          <group ref={azimuth}>
            <mesh position={[0, -0.42, 0]}>
              <cylinderGeometry args={[0.3, 0.3, 0.16, 24]} />
              <meshStandardMaterial color="#5b6e69" metalness={0.6} roughness={0.35} />
            </mesh>
            {[-0.62, 0.62].map((x) => (
              <mesh key={x} position={[x, -0.15, 0]}>
                <boxGeometry args={[0.12, 0.6, 0.22]} />
                <meshStandardMaterial color="#6f817c" metalness={0.55} roughness={0.4} />
              </mesh>
            ))}
            <group ref={elevation}>
              <group position={[0, 0, 0.12]}>
                <Dish />
              </group>
              {/* Beam: narrow cone along boresight (drawn wider than the 0.95° beam to stay visible) */}
              <mesh position={[0, 0, 0.9 + 5]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.32, 10, 24, 1, true]} />
                <meshBasicMaterial
                  ref={beam}
                  color="#3aa8a1"
                  transparent
                  opacity={0.1}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          </group>
        </group>
      </group>
      {[0, 1, 2].map((k) => (
        <mesh
          key={k}
          ref={(m) => {
            rings.current[k] = m;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.03 + k * 0.004, 0]}
          visible={false}
        >
          <ringGeometry args={[0.93, 1, 128]} />
          <meshBasicMaterial
            color="#3aa8a1"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
      {[5.2, 6.8, 8.4].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[r, r + 0.016, 128]} />
          <meshBasicMaterial
            color="#72b8b5"
            transparent
            opacity={0.3 - i * 0.07}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <shadowMaterial transparent opacity={dark ? 0.32 : 0.14} />
      </mesh>
    </>
  );
}

export default function DopplerRadarScene({
  rotation,
  pulse,
  xray,
  still,
  paused,
  dark = false,
  onElevation,
}: {
  rotation: React.RefObject<number>;
  pulse: React.RefObject<number>;
  xray: boolean;
  still: boolean;
  /** Stops rendering while the scene is off-screen. */
  paused?: boolean;
  dark?: boolean;
  onElevation?: (deg: number) => void;
}) {
  return (
    <Canvas
      frameloop={paused ? 'never' : still ? 'demand' : 'always'}
      shadows
      dpr={[1, still ? 1.25 : 1.6]}
      camera={{ position: [13, 8.4, 15.5], fov: 31 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onCreated={({ camera }) => camera.lookAt(-0.4, 3.4, 0)}
    >
      <ambientLight intensity={1.2} />
      <hemisphereLight args={['#eff6fa', '#b8c0ae', 1.8]} />
      <directionalLight
        position={[-6, 12, 7]}
        intensity={3.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={12}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0008}
      />
      <directionalLight position={[6, 5, -6]} intensity={1.6} color="#c9e3e8" />
      <Suspense fallback={null}>
        <Radar
          rotation={rotation}
          pulse={pulse}
          xray={xray}
          still={still}
          dark={dark}
          onElevation={onElevation}
        />
      </Suspense>
    </Canvas>
  );
}
