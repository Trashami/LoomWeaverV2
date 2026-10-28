import { parseAura } from '../aura-settings';
import {
  EffectDefinition,
  EffectLayer,
  VARIANTS,
  defaultProjectileCoreForVariant,
  defaultParticularForLayer,
} from '../effect-definition';
import { evaluateParticularSprites } from '../particular-settings';
import { materialFrame, materialParticle, projectileMaterialPoint } from '../arcane-motion';
import {
  clippedFireball,
  EffectWorld,
  fireballContact,
  fireballCurve,
  FIREBALL_FLIGHT_FRACTION,
  FxPoint,
  seeded,
} from '../fireball-motion';
import { missilePosition, missileTiming } from '../missile-path';
import { handFrame } from '../mage-hand-path';
import { opacityAt } from '../../shared/animation/animation-curves';
import { evaluateExtendedLayer } from './extended-frame-eval';
import { NativeProjectile3D } from './projectile-3d-mesh';

export interface NativePoint extends FxPoint {
  height: number;
}
export interface NativeParticle extends NativePoint {
  size: number;
  alpha: number;
  rotation: number;
  stretch: number;
  tile: number;
  color: string;
  dirX?: number;
  dirY?: number;
  dirZ?: number;
}
export interface NativeRibbon {
  points: NativePoint[];
  width: number;
  color: string;
  taper: boolean;
}
export interface NativeField {
  point: NativePoint;
  width: number;
  depth: number;
  angle: number;
  family: 'fire' | 'arcane' | 'cinematic' | 'barrier';
  mode: number;
  progress: number;
  variant: number;
  vertical?: boolean;
}
export interface NativeLayerFrame {
  layer: EffectLayer;
  alpha: number;
  progress: number;
  clock: number;
  particles: NativeParticle[];
  ribbons: NativeRibbon[];
  fields: NativeField[];
  projectiles: NativeProjectile3D[];
  vine?: NativePoint[];
  hand?: { point: NativePoint; size: number; angle: number };
}

const TAU = Math.PI * 2;
const point = (p: FxPoint, height = 12): NativePoint => ({ ...p, height });

/** Renderer-independent, seeded frame evaluation. 66 design pixels equal one 5-foot grid square. */
export function evaluateNativeLayer(
  l: EffectLayer,
  time: number,
  from: FxPoint,
  to: FxPoint,
  scale = 1,
  targets: FxPoint[] = [to],
  world: EffectWorld = {}
): NativeLayerFrame {
  const f = materialFrame(l, time, from, to, scale),
    local = (time - l.delay) / l.duration,
    p = f.p;
  const out: NativeLayerFrame = {
    layer: l,
    alpha: Math.max(
      0,
      l.opacity * l.intensity * opacityAt(l.opacityKeyframes, Math.max(0, Math.min(1, local))) * f.envelope
    ),
    progress: p,
    clock: f.clock,
    particles: [],
    ribbons: [],
    fields: [],
    projectiles: [],
  };
  if (out.alpha <= 0.00001) return out;

  const size = l.size * scale,
    extent = f.extent,
    angle = f.angle,
    variant = VARIANTS[l.kind].findIndex((v) => v.id === l.variant);
  const offset = (q: FxPoint): FxPoint => ({
    x: q.x + (Math.cos(angle) * l.offsetX - Math.sin(angle) * l.offsetY) * scale,
    y: q.y + (Math.sin(angle) * l.offsetX + Math.cos(angle) * l.offsetY) * scale,
  });
  const ribbon = (points: NativePoint[], width = size, color = l.color, taper = false) =>
    out.ribbons.push({ points, width: Math.max(0.35 * scale, width), color, taper });
  const field = (
    q: FxPoint,
    width: number,
    depth = width,
    family: NativeField['family'] = 'arcane',
    mode = 2,
    height = 10 * scale,
    rotation = 0,
    progress = p
  ) =>
    out.fields.push({ point: point(q, height), width, depth, angle: rotation, family, mode, progress, variant });
  const particle = (
    q: FxPoint,
    r: number,
    alpha: number,
    tile = 1,
    height = 16 * scale,
    rotation = 0,
    stretch = 1,
    color = l.color
  ) =>
    out.particles.push({
      ...point(q, height),
      size: Math.max(0.1, r),
      alpha: Math.max(0, alpha),
      tile,
      rotation,
      stretch,
      color,
    });

  if (l.fireMaterial || l.fireHit) {
    const m = l.fireMaterial,
      role = m?.role ?? 'impact',
      flight = p / FIREBALL_FLIGHT_FRACTION;
    const target =
      world.targetAt?.(
        role === 'projectile'
          ? l.delay + l.duration * FIREBALL_FLIGHT_FRACTION
          : world.flight?.arrival ?? l.delay
      ) ?? to;
    const dist = Math.hypot(target.x - from.x, target.y - from.y) || 1,
      release = {
        x: from.x + ((target.x - from.x) / dist) * 25 * scale,
        y: from.y + ((target.y - from.y) / dist) * 25 * scale,
      };
    const sample = (t: number) =>
      offset(clippedFireball(release, target, t, m?.arc ?? world.flight?.arc ?? -55, scale, world.walls));
    const hAt = (u: number) => (25 + Math.sin(u * Math.PI) * 20) * scale;
    const anchor =
      role === 'caster' ? offset(from) : role === 'projectile' ? sample(Math.min(1, flight)) : sample(1);

    if (role !== 'projectile' || flight < 1) {
      field(
        anchor,
        size * 4.4,
        size * 4.4,
        'fire',
        role === 'caster' ? 0 : role === 'projectile' ? 1 : 2,
        role === 'impact' ? 14 * scale : role === 'projectile' ? hAt(Math.min(1, flight)) : 20 * scale,
        0,
        role === 'projectile' ? flight : p
      );
    }

    if (role === 'impact' && p < 0.85) {
      // True 3D Expanding & Rising Molten Detonation Core Sphere (no flat X/Y card!)
      const blastEnv = Math.sin(Math.pow(p / 0.85, 0.45) * Math.PI);
      const coreRise = (18 + Math.pow(p, 0.72) * 58) * scale;
      out.projectiles.push({
        head: point(anchor, coreRise),
        prev: point(anchor, Math.max(4 * scale, coreRise - 12 * scale)),
        radius: Math.max(10 * scale, size * (0.28 + blastEnv * 0.56)),
        element: 'fire',
        shape: 'sphere',
        coreScale: 1.18,
        coronaSize: 1.55,
        spinSpeed: 2.6,
        orbitCount: 3,
        clock: f.clock,
        progress: p,
        color: l.color,
        secondaryColor: l.secondaryColor,
      });

      // 3D Rising Thermal Convection Spiral Ribbons + Expanding Ground Blast Wave
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const spiralPts: NativePoint[] = Array.from({ length: 28 }, (_, j) => {
          const u = j / 27;
          const ang = u * TAU * 1.65 + f.clock * 3.2 + sIdx * Math.PI;
          const rad = size * (0.22 + (1 - u * 0.35) * p * 0.85);
          return point(
            { x: anchor.x + Math.cos(ang) * rad, y: anchor.y + Math.sin(ang) * rad },
            (6 + u * (28 + p * 74)) * scale
          );
        });
        ribbon(spiralPts, size * 0.16 * (1 - p * 0.5), sIdx === 0 ? l.secondaryColor : l.color, true);
      }
    }

    if (role === 'projectile' && flight < 1) {
      const uNow = Math.min(1, flight);
      const uPrev = Math.max(0, uNow - 0.04);
      out.projectiles.push({
        head: point(sample(uNow), hAt(uNow)),
        prev: point(sample(uPrev), hAt(uPrev)),
        radius: Math.max(8 * scale, size * 0.72),
        element: 'fire',
        shape: 'comet',
        coreScale: 1.0,
        coronaSize: 1.25,
        spinSpeed: 2.2,
        orbitCount: 2,
        clock: f.clock,
        progress: uNow,
        color: l.color,
        secondaryColor: l.secondaryColor,
      });
      const pts = Array.from({ length: 35 }, (_, i) => {
        const u = Math.max(0, flight - (i / 34) * 0.24 * (m?.trail ?? 1));
        return point(sample(u), hAt(u));
      }).reverse();
      ribbon(pts, size * 0.9, l.color, true);
    }

    // 3D Trapcode Particular Pyrotechnic Sprite Evaluation (Flame Tongues + Aux Ember Trails)
    if (role !== 'projectile') {
      const partSettings =
        l.particular ?? defaultParticularForLayer(role === 'caster' ? 'aura' : 'burst', 'fire', l.color);
      const partSprites = evaluateParticularSprites(
        partSettings,
        anchor,
        16 * scale,
        p,
        f.clock,
        l.count,
        scale,
        l.motion.seed,
        l.color,
        l.secondaryColor,
        angle
      );
      for (const sp of partSprites) {
        out.particles.push(sp);
      }
    }

    // 3D Buoyant Mushroom Smoke Plume & Ballistic Ground-Bouncing Embers
    const count = Math.min(80, l.count),
      smokeLife = (role === 'projectile' ? 1050 : 2000) * (m?.trail ?? 1),
      smoke = l.fireMaterial?.smoke ?? l.fireHit?.smoke ?? 0.75,
      turb = l.fireMaterial?.turbulence ?? l.fireHit?.turbulence ?? 0.9;
    for (let i = 0; i < count; i++) {
      const a = seeded(i, l.motion.seed),
        b = seeded(i + 97, l.motion.seed),
        cSeed = seeded(i + 211, l.motion.seed),
        theta = a * TAU + (b - 0.5) * turb * 0.8,
        age =
          role === 'projectile'
            ? (p * l.duration - (i / Math.max(1, count - 1)) * l.duration * FIREBALL_FLIGHT_FRACTION) / smokeLife
            : (p - a * 0.22) / 0.82;
      if (age <= 0 || age >= 1) continue;
      const uSample = i / Math.max(1, count - 1);
      const origin = role === 'projectile' ? sample(uSample) : anchor;
      // Mushroom plume: narrows slightly at stem, then billows outward at cap height
      const plumeHeight =
        role === 'projectile'
          ? hAt(uSample) + age * 28 * scale
          : (14 + Math.pow(age, 0.78) * (55 + cSeed * 65)) * scale;
      const capSpread = age > 0.35 ? 1 + (age - 0.35) * 1.45 : 0.65 + age;
      const r = size * (role === 'caster' ? 0.35 + b * 0.45 : (0.18 + age * (0.55 + b * 0.95)) * capSpread);
      const q = {
        x: origin.x + Math.cos(theta + f.clock * (role === 'caster' ? 1.2 : 0.35)) * r,
        y: origin.y + Math.sin(theta + f.clock * (role === 'caster' ? 1.2 : 0.35)) * r,
      };
      // Volumetric Lit Smoke Plume Sprite (Tile 0) rising in 3D
      out.particles.push({
        ...point(q, plumeHeight),
        size: size * (0.32 + age * 0.88) * (0.75 + cSeed * 0.5),
        alpha: Math.min(1, age * 7) * Math.pow(1 - age, 1.45) * smoke * 0.52,
        tile: 0,
        rotation: theta + f.clock * (i % 2 ? 0.8 : -0.8),
        stretch: 1.08,
        color: l.fireMaterial?.smokeColor ?? l.fireHit?.smokeColor ?? '#4a4149',
      });

      // Ballistic 3D Ember Spark (Tile 2) aligned with true 3D trajectory vector
      const vHoriz = size * (0.9 + b * 2.1);
      const d = (1 - Math.exp(-age * 3.8)) * vHoriz;
      const launchZ = (35 + cSeed * 75) * scale;
      const gravZ = 115 * scale;
      let emberH = 12 * scale + launchZ * age - 0.5 * gravZ * age * age;
      let vz = launchZ - gravZ * age;
      if (emberH < 3 * scale) {
        emberH = 3 * scale + Math.abs(emberH - 3 * scale) * 0.45;
        vz = Math.abs(vz) * 0.45;
      }
      const vx = Math.cos(theta) * vHoriz * Math.exp(-age * 3.8);
      const vy = Math.sin(theta) * vHoriz * Math.exp(-age * 3.8);
      out.particles.push({
        x: origin.x + Math.cos(theta) * d,
        y: origin.y + Math.sin(theta) * d,
        height: emberH,
        size: (1.6 + b * 2.8) * scale,
        alpha: Math.pow(1 - age, 1.65) * (l.fireMaterial?.embers ?? l.fireHit?.embers ?? 1.2),
        tile: 2,
        rotation: theta,
        stretch: 2.1 + b * 1.4,
        color: i % 2 === 0 ? l.secondaryColor : l.color,
        dirX: vx,
        dirY: vz,
        dirZ: vy,
      });
    }
    return out;
  }

  if (l.missile) {
    const m = l.missile;
    for (let bolt = 0; bolt < 3; bolt++) {
      const t = missileTiming(l.duration, m.launchGap, bolt),
        q = (p * l.duration - t.offset) / t.flight,
        target = targets[m.targets[bolt]] ?? to;
      if (q < 0 || q > 1) continue;
      const sample = (u: number) => offset(missilePosition(u, from, target, bolt, m, scale)),
        height = (u: number) => (20 + Math.sin(Math.min(1, u / 0.8) * Math.PI) * m.rise) * scale;
      if (q < 0.8) {
        const head = sample(q);
        const prev = sample(Math.max(0, q - 0.04));
        field(head, size * 5.2, size * 5.2, 'arcane', 2, height(q));
        out.projectiles.push({
          head: point(head, height(q)),
          prev: point(prev, height(Math.max(0, q - 0.04))),
          radius: Math.max(5.5 * scale, size * 0.78),
          element: 'eldritch',
          shape: 'prism',
          coreScale: 0.85,
          coronaSize: 1.2,
          spinSpeed: 2.4,
          orbitCount: 2,
          clock: f.clock + bolt * 0.7,
          progress: q / 0.8,
          color: l.color,
          secondaryColor: l.secondaryColor,
        });
        ribbon(
          Array.from({ length: 30 }, (_, i) => {
            const u = Math.max(0, q - ((29 - i) / 29) * 0.13);
            return point(sample(u), height(u));
          }),
          size * 0.8,
          l.color,
          true
        );
      }
      for (let i = 0; i < 35; i++) {
        const age = ((i / 34) * m.smokeLife) / t.flight,
          u = q - age;
        if (u < 0 || u > 0.8) continue;
        const a = seeded(i + bolt * 53, l.motion.seed),
          at = sample(u),
          r = m.smokeSpread * scale * (0.3 + age * 2);
        particle(
          { x: at.x + Math.sin(a * TAU) * r, y: at.y + Math.cos(a * TAU) * r },
          (5 + age * 35) * scale,
          m.smokeOpacity * (1 - i / 35) ** 2,
          0,
          height(u) + age * 15 * scale,
          a * TAU,
          1,
          m.smokeColor
        );
      }
      if (q >= 0.8) field(target, m.impactSize * 8 * scale, m.impactSize * 8 * scale, 'cinematic', 3, 12 * scale, 0, (q - 0.8) / 0.2);
    }
    return out;
  }

  if (l.mageHand) {
    const h = handFrame(l.mageHand, p, from, to),
      at = offset(h);
    out.hand = { point: point(at, 25 * scale), size: Math.max(2, size * 1.4 * h.size), angle: h.angle };
    out.alpha *= h.alpha;
    const trail = Array.from({ length: 28 }, (_, i) => {
      const old = handFrame(l.mageHand!, Math.max(0, p - ((27 - i) / 27) * 0.14), from, to);
      return point(offset(old), (25 + Math.sin((i / 27) * Math.PI) * 6) * scale);
    });
    ribbon(trail, size * 0.12 * l.mageHand.wisps, l.color, true);
    for (let i = 0; i < Math.round(l.count * l.mageHand.wisps); i++) {
      const a = seeded(i, l.motion.seed),
        b = seeded(i + 43, l.motion.seed),
        u = Math.max(0, p - a * 0.12),
        old = handFrame(l.mageHand, u, from, to);
      particle(offset(old), size * (0.08 + b * 0.2) * h.size, (1 - a) * 0.35, 0, (24 + b * 15) * scale, a * TAU, 1, l.secondaryColor);
    }
    return out;
  }

  if (l.cinematic) {
    const c = l.cinematic,
      reach = (c.reachFeet / 5) * 66 * scale,
      width = (c.widthFeet / 5) * 66 * scale;
    if (c.style === 'cone' || c.style === 'beam') {
      const length = c.style === 'beam' ? f.length : reach,
        base = offset(from),
        center = { x: base.x + (Math.cos(angle) * length) / 2, y: base.y + (Math.sin(angle) * length) / 2 };
      field(center, length, c.style === 'beam' ? Math.max(size * 10, 22 * scale) : width, 'cinematic', c.style === 'cone' ? 1 : 0, 20 * scale, angle);
    } else {
      field(
        c.style === 'cube'
          ? offset({ x: from.x + (Math.cos(angle) * reach) / 2, y: from.y + (Math.sin(angle) * reach) / 2 })
          : f.anchor,
        width,
        width,
        'cinematic',
        c.style === 'column' ? 2 : c.style === 'cube' ? 4 : 3,
        c.style === 'column' ? width * 0.5 : 12 * scale
      );
      if (c.style === 'column') out.fields[out.fields.length - 1].vertical = true;
      if (c.style === 'nova' && p < 0.78) {
        const blastEnv = Math.sin(Math.pow(p / 0.78, 0.48) * Math.PI);
        const elemMap: Record<string, NativeProjectile3D['element']> = {
          fire: 'fire',
          ice: 'ice',
          force: 'eldritch',
          radiant: 'radiant',
          lightning: 'lightning',
          acid: 'acid',
          shadow: 'shadow',
          gas: 'acid',
        };
        out.projectiles.push({
          head: point(f.anchor, (16 + p * 34) * scale),
          prev: point(f.anchor, (8 + p * 20) * scale),
          radius: Math.max(8 * scale, width * (0.14 + blastEnv * 0.24)),
          element: elemMap[c.element] ?? 'arcane',
          shape: c.element === 'ice' ? 'prism' : c.element === 'radiant' ? 'star' : 'sphere',
          coreScale: 1.05,
          coronaSize: 1.35,
          spinSpeed: 2.4,
          orbitCount: 2,
          clock: f.clock,
          progress: p,
          color: l.color,
          secondaryColor: l.secondaryColor,
        });
      }
    }
  }

  if (!l.cinematic && evaluateExtendedLayer(l, f, out, from, to, scale, targets, offset)) {
    if (l.particular?.enabled) {
      const partSprites = evaluateParticularSprites(
        l.particular,
        f.anchor,
        14 * scale,
        p,
        f.clock,
        l.count,
        scale,
        l.motion.seed,
        l.color,
        l.secondaryColor,
        angle
      );
      for (const sp of partSprites) out.particles.push(sp);
    }
    return out;
  }

  const path = !l.cinematic && (l.kind === 'beam' || l.kind === 'lightning' || l.kind === 'tether');
  if (path) {
    const strands =
      l.kind === 'beam' ? (variant === 2 ? 3 : variant === 4 ? 2 : 1) : l.kind === 'lightning' ? (variant === 2 ? 5 : variant === 4 ? 3 : 1) : variant === 1 ? 3 : 2;
    for (let strand = 0; strand < strands; strand++) {
      const n = l.kind === 'lightning' ? 64 : 72,
        pts: NativePoint[] = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n,
          travel = u * (l.kind === 'tether' ? 1 : Math.min(1, p * 4 * l.motion.speed)),
          w = Math.sin(u * Math.PI);
        let bend = 0,
          height = 18 * scale;
        if (l.kind === 'lightning') {
          bend = (seeded(i + strand * 81 + Math.floor(f.clock * 18) * 137, l.motion.seed) - 0.5) * l.spread * scale * (0.2 + variant * 0.18);
          height += (seeded(i + strand * 5, 92) - 0.5) * size * 2;
        } else if (l.kind === 'beam') {
          const turbScale = l.motion.turbulence / 100;
          bend =
            (variant === 0
              ? Math.sin(u * 38 - f.clock * 11) * turbScale * 0.55
              : Math.sin(u * (variant === 4 ? 25 : 14) - f.clock * 8 + (strand * TAU) / strands) * ((variant === 1 ? 0.65 : 0.32) + turbScale * 0.35)) *
            l.spread *
            scale *
            w;
          height += variant === 4 ? Math.cos(u * 25 - f.clock * 8 + strand * Math.PI) * size * 2 : 0;
        } else {
          bend = Math.sin(u * (variant === 0 ? 60 : 18) - f.clock * (variant === 3 ? -5 : 4) + strand * Math.PI) * size * (variant === 0 ? 1 : 2);
          height += Math.sin(u * Math.PI) * l.spread * scale * 0.15;
        }
        pts.push(
          point(
            offset({
              x: from.x + Math.cos(angle) * f.length * travel - Math.sin(angle) * bend,
              y: from.y + Math.sin(angle) * f.length * travel + Math.cos(angle) * bend,
            }),
            height
          )
        );
      }
      if (l.kind === 'beam' && variant === 3) {
        for (let i = 0; i < 8; i++) ribbon(pts.slice(i * 9, i * 9 + 5), size * 0.8);
      } else ribbon(pts, size * (l.kind === 'lightning' ? 0.35 : l.kind === 'tether' ? 0.5 : 1));
      if (l.kind === 'lightning' && variant > 0)
        for (let j = 1; j < 4; j++) {
          const start = pts[j * 15],
            end = point(
              { x: start.x + Math.cos(angle + 0.6) * f.length * 0.13, y: start.y + Math.sin(angle + 0.6) * f.length * 0.13 },
              start.height + 10 * scale
            );
          ribbon([start, point({ x: (start.x + end.x) / 2 + size, y: (start.y + end.y) / 2 - size }, end.height), end], size * 0.2);
        }
    }
  } else if (l.kind === 'whip') {
    const pts = f.whipPoints!.map((q) =>
      point(
        offset({
          x: from.x + Math.cos(angle) * q.x - Math.sin(angle) * q.y,
          y: from.y + Math.sin(angle) * q.x + Math.cos(angle) * q.y,
        }),
        (22 + Math.sin(p * Math.PI) * Math.abs(q.y) * 0.25) * scale
      )
    );
    if (l.variant === 'vine') out.vine = pts;
    else ribbon([...pts].reverse(), size, l.color, true);
    const contact = (l.whip.windup + l.whip.strike) / (l.whip.windup + l.whip.strike + l.whip.retract),
      after = p - contact;
    if (after >= 0 && after < 0.14) {
      const age = after / 0.14,
        tip = offset({ x: from.x + Math.cos(angle) * f.length * l.whip.reach, y: from.y + Math.sin(angle) * f.length * l.whip.reach });
      for (let i = 0; i < 18; i++) {
        const a = i * 2.399,
          r = age * (16 + seeded(i, l.motion.seed) * 22) * scale;
        particle({ x: tip.x + Math.cos(a) * r, y: tip.y + Math.sin(a) * r }, (1.5 + seeded(i, 82)) * scale, (1 - age) ** 2, 2, (14 + Math.sin(age * Math.PI) * 18) * scale, a, 2, l.secondaryColor);
      }
    }
    const n = l.variant === 'vine' ? 0 : Math.min(40, l.whip.thorns);
    for (let i = 1; i <= n; i++) {
      const at = pts[Math.floor((i / (n + 1)) * (pts.length - 1))],
        sign = i % 2 ? 1 : -1;
      const tip = point(
        {
          x: at.x - Math.sin(angle) * l.whip.thornSize * scale * sign,
          y: at.y + Math.cos(angle) * l.whip.thornSize * scale * sign,
        },
        at.height + 4 * scale
      );
      ribbon([at, tip], size * 0.5, l.secondaryColor, true);
    }
  } else if (l.kind === 'projectile' && !l.cinematic) {
    const varDefaults = defaultProjectileCoreForVariant(l.variant, l.color);
    const core = l.projectileCore
      ? {
          ...l.projectileCore,
          shape: l.projectileCore.shape === 'sphere' && l.variant !== 'orb' ? varDefaults.shape : l.projectileCore.shape,
        }
      : varDefaults;
    const n = l.variant === 'swarm' ? 5 : 1;
    const baseArc = core.arc;
    const sample3D = (u: number, idx: number, arcVal: number, maxFrac: number): NativePoint => {
      const uClamped = Math.max(0, Math.min(maxFrac, u));
      const curved = fireballCurve(from, to, uClamped, arcVal, scale);
      const env = Math.sin((uClamped / Math.max(0.01, maxFrac)) * Math.PI);
      const turbWave =
        (Math.sin(uClamped * 8 + idx) * l.motion.turbulence * 0.35 +
          Math.sin(uClamped * TAU + f.clock * l.motion.twirl * TAU) * l.motion.twirl * 4) *
        scale *
        env;
      const basePt = offset({
        x: curved.x - Math.sin(angle) * turbWave,
        y: curved.y + Math.cos(angle) * turbWave + l.motion.gravity * uClamped * uClamped * 0.25 * scale,
      });
      const arcLift = env * (Math.abs(arcVal) * 0.48 + variant * 3.5) * scale;
      return point(basePt, (22 + variant * 1.5 + (idx % 2 ? 4 : -2)) * scale + arcLift);
    };
    for (let i = 0; i < n; i++) {
      const arcForBolt = baseArc + (i - (n - 1) / 2) * 18;
      const contact = fireballContact(from, to, arcForBolt, scale, world.walls);
      const rawT = Math.max(0, Math.min(1, (p * l.motion.speed * 1.18) / (1 + l.motion.drag * p) - i * 0.04));
      const t = Math.min(rawT, contact.fraction);
      const hitWall = contact.fraction < 0.999 && rawT >= contact.fraction;
      const head = sample3D(t, i, arcForBolt, contact.fraction);
      const prev = sample3D(Math.max(0, t - 0.04), i, arcForBolt, contact.fraction);
      // Volumetric shader glow field anchored directly at the 3D projectile head (or wall impact)
      field(
        { x: head.x, y: head.y },
        size * (core.element === 'fire' ? 4.8 : 5.2) * core.coronaSize * (hitWall ? 1.35 : 1),
        size * (core.element === 'fire' ? 4.8 : 5.2) * core.coronaSize * (hitWall ? 1.35 : 1),
        core.element === 'fire' ? 'fire' : 'arcane',
        hitWall ? 2 : core.element === 'fire' ? 1 : 2,
        head.height,
        angle,
        t
      );
      if (!hitWall) {
        out.projectiles.push({
          head,
          prev,
          radius: Math.max(8 * scale, size * (n > 1 ? 0.55 : 0.8 + variant * 0.05)),
          element: core.element,
          shape: core.shape,
          coreScale: core.coreScale,
          coronaSize: core.coronaSize,
          spinSpeed: core.spinSpeed + variant * 0.15,
          orbitCount: core.orbitCount,
          clock: f.clock + i * 0.5,
          progress: t,
          color: l.color,
          secondaryColor: l.secondaryColor,
        });
      }

      const wakeLen = (0.08 + l.motion.trail * 0.22 + variant * 0.025) * core.wakeLength;
      const coils = Math.max(1, Math.min(5, core.wakeRibbons));
      for (let c = 0; c < coils; c++) {
        const coilPhase = (c * TAU) / coils + variant * 0.4;
        const pts = Array.from({ length: 26 }, (_, j) => {
          const frac = j / 25;
          const u = Math.max(0, t - (1 - frac) * wakeLen);
          const centerPt = sample3D(u, i, arcForBolt, contact.fraction);
          if (c === 0) return centerPt;
          const helixR = (1 - frac) * Math.max(2.5 * scale, size * (0.32 + variant * 0.04));
          const theta = frac * (9 + variant) + f.clock * core.spinSpeed * 4 + coilPhase;
          return {
            x: centerPt.x - Math.sin(angle) * Math.cos(theta) * helixR,
            y: centerPt.y + Math.cos(angle) * Math.cos(theta) * helixR,
            height: centerPt.height + Math.sin(theta) * helixR,
          };
        });
        ribbon(
          pts,
          size * (c === 0 ? 0.75 : 0.36) * (n > 1 ? 0.65 : 1),
          c % 2 === 0 ? l.color : l.secondaryColor,
          true
        );
      }

      const pCount = Math.max(6, Math.min(48, Math.round(l.count / n)));
      const pTile =
        core.element === 'ice'
          ? 5
          : core.element === 'snow'
            ? 0
            : core.element === 'fire' || core.element === 'lightning' || core.element === 'eldritch'
              ? 2
              : 1;
      for (let k = 0; k < pCount; k++) {
        const seedA = seeded(k + i * 71, l.motion.seed);
        const seedB = seeded(k + i * 71 + 193, l.motion.seed);
        const age = ((f.clock * 2.2 + seedA) % 1) * Math.min(1, rawT * 2.5);
        const uTrail = Math.max(0, t - age * wakeLen * 1.15);
        const trailPt = sample3D(uTrail, i, arcForBolt, contact.fraction);
        const theta = seedA * TAU + f.clock * core.spinSpeed * 2.5;
        const radialSpread = (0.15 + age * (0.85 + seedB * 0.9)) * Math.max(3 * scale, size * 0.42);
        const px = trailPt.x - Math.sin(angle) * Math.cos(theta) * radialSpread;
        const py = trailPt.y + Math.cos(angle) * Math.cos(theta) * radialSpread;
        const ph = trailPt.height + Math.sin(theta) * radialSpread;
        const pSize =
          core.element === 'snow'
            ? (2.5 + seedB * 4.5) * scale
            : (1.2 + seedB * 2.4) * scale * Math.max(0.6, core.coreScale);
        particle(
          { x: px, y: py },
          pSize,
          (1 - age) ** 1.6 * 0.85,
          pTile,
          ph,
          angle + (seedB - 0.5) * 0.5,
          pTile === 2 ? 2.2 + seedB : 1.1,
          k % 2 === 0 ? l.secondaryColor : l.color
        );
      }
    }
    return out;
  } else if (l.kind === 'wall') {
    field(f.anchor, extent * 2.8, extent * 1.4, 'barrier', variant, extent * 0.7, angle + Math.PI / 2);
    out.fields[out.fields.length - 1].vertical = true;
  } else if (l.kind === 'sigil' || l.kind === 'ring') {
    for (let ring = 0; ring < (variant === 3 ? 3 : 2); ring++) {
      const radius = extent * (l.kind === 'ring' && variant < 2 ? 0.2 + p : 1) * (1 - ring * 0.23),
        segments = variant === 2 && l.kind === 'sigil' ? 5 : variant === 4 ? 6 : 96,
        pts = Array.from({ length: segments + 1 }, (_, i) => {
          const t = ((l.kind === 'sigil' && variant === 2 ? i * 2 : i) / segments) * TAU + f.clock * 0.3 * (ring % 2 ? 1 : -1);
          return point({ x: f.anchor.x + Math.cos(t) * radius, y: f.anchor.y + Math.sin(t) * radius }, 2 * scale + ring * 0.2);
        });
      ribbon(pts, Math.max(1.3 * scale, size * 0.025));
    }
    if (l.kind === 'sigil')
      for (let i = 0; i < 12 + variant * 2; i++) {
        const a = (i / (12 + variant * 2)) * TAU + f.clock * 0.25,
          c = Math.cos(a),
          s = Math.sin(a),
          r = extent * 0.78;
        ribbon(
          [
            point({ x: f.anchor.x + c * r - s * 4 * scale, y: f.anchor.y + s * r + c * 4 * scale }, 3 * scale),
            point({ x: f.anchor.x + c * (r + 9 * scale), y: f.anchor.y + s * (r + 9 * scale) }, 3 * scale),
            point({ x: f.anchor.x + c * r + s * 4 * scale, y: f.anchor.y + s * r - c * 4 * scale }, 3 * scale),
          ],
          1.4 * scale
        );
      }
  } else if (!l.cinematic && l.kind !== 'sparks')
    field(
      f.anchor,
      extent * 3,
      extent * 3,
      (l.kind === 'aura' && l.variant === 'flame') || (l.kind === 'burst' && l.variant === 'fire') ? 'fire' : 'arcane',
      l.kind === 'burst' ? (l.variant === 'fire' ? 2 : 3) : l.kind === 'aura' ? (l.variant === 'flame' ? 0 : 4) : l.kind === 'cloud' ? 5 : 2,
      12 * scale
    );

  if (l.kind === 'aura' && l.variant === 'flame') {
    for (let i = 0; i < 36; i++) {
      const seed = seeded(i, l.motion.seed),
        age = (f.clock * 0.38 + seed) % 1,
        a = i * 2.399 + f.clock * 0.2,
        r = extent * (0.4 + seed * 0.5),
        at = { x: f.anchor.x + Math.cos(a) * r, y: f.anchor.y + Math.sin(a) * r };
      particle(at, (8 + age * 22) * scale, Math.sin(age * Math.PI) * 0.18, 0, (10 + age * extent * 1.5) * scale, a, 1, '#66565b');
      particle(at, (1 + seed * 1.6) * scale, (1 - age) * 0.9, 2, (8 + age * extent * 1.8) * scale, a, 2.8, l.secondaryColor);
    }
  }

  if (l.kind === 'aura' && ['vortex', 'orbit', 'halo'].includes(l.variant)) {
    const aura = parseAura(l.aura, l.variant), turns = aura.turns;
    for (let strand = 0; strand < aura.strands; strand++) {
      const pts = Array.from({ length: 65 }, (_, i) => {
        const u = i / 64,
          a = u * TAU * turns + f.clock * l.motion.speed * aura.rotation * (strand % 2 ? -1 : 1) + (strand * TAU) / aura.strands,
          r = extent * (0.58 + 0.22 * Math.sin(u * Math.PI));
        return point({ x: f.anchor.x + Math.cos(a) * r, y: f.anchor.y + Math.sin(a) * r }, (5 + u * extent * aura.height / 100) * scale);
      });
      ribbon(pts, Math.max(0.7 * scale, size * 0.018) * aura.width, strand === 1 ? l.secondaryColor : l.color, true);
    }
    for (let i = 0; i < aura.motes; i++) {
      const u = (i / Math.max(1, aura.motes) + f.clock * l.motion.speed * 0.12) % 1,
        a = i * 2.399 + f.clock * l.motion.speed * aura.rotation * 0.5,
        r = extent * (0.7 + 0.2 * Math.sin(i));
      particle({ x: f.anchor.x + Math.cos(a) * r, y: f.anchor.y + Math.sin(a) * r }, (1 + seeded(i, 71) * 1.4) * scale, Math.sin(u * Math.PI) * 0.8, 2, (6 + u * extent) * scale, a, 2, l.secondaryColor);
    }
  }

  if (l.kind === 'sigil') {
    for (let ring = 0; ring < 2; ring++)
      for (let segment = 0; segment < 16; segment++) {
        const r = extent * (ring ? 1.1 : 0.56),
          base = (segment / 16) * TAU + f.clock * 0.12 * (ring ? 1 : -1);
        ribbon(
          Array.from({ length: 9 }, (_, i) => {
            const a = base + (i / 8) * 0.22;
            return point({ x: f.anchor.x + Math.cos(a) * r, y: f.anchor.y + Math.sin(a) * r }, 2.5 * scale);
          }),
          Math.max(0.7 * scale, size * 0.012),
          ring ? l.color : l.secondaryColor
        );
      }
    for (let i = 0; i < 18; i++) {
      const a = i * 2.399 + f.clock * 0.12,
        u = (i / 18 + f.clock * 0.14) % 1,
        r = extent * (0.45 + seeded(i, 43) * 0.65);
      particle({ x: f.anchor.x + Math.cos(a) * r, y: f.anchor.y + Math.sin(a) * r }, 1.4 * scale, Math.sin(u * Math.PI) * 0.75, 2, (4 + u * extent * 0.65) * scale, a, 1.5, l.secondaryColor);
    }
  }

  if (l.particular?.enabled) {
    const partSprites = evaluateParticularSprites(
      l.particular,
      f.anchor,
      14 * scale,
      p,
      f.clock,
      l.count,
      scale,
      l.motion.seed,
      l.color,
      l.secondaryColor,
      angle
    );
    for (const sp of partSprites) out.particles.push(sp);
  }

  const count = Math.min(100, Math.max(4, l.count));
  for (let i = 0; i < count; i++) {
    const mist = l.kind === 'cloud' || l.variant === 'mist' || l.variant === 'smoke',
      q = materialParticle(l, f, i, count, from, to, scale, targets, mist),
      a = seeded(i + 901, l.motion.seed),
      b = seeded(i + 1423, l.motion.seed),
      age = ((f.clock * Math.max(0.05, l.motion.speed)) / (l.motion.lifetime + 0.2) + a) % 1;
    let at: FxPoint = ['beam', 'lightning', 'tether', 'projectile', 'whip'].includes(l.kind) ? offset(q) : q,
      sz = q.size,
      alpha = q.alpha,
      height = (8 + age * (l.kind === 'cloud' ? extent : l.kind === 'burst' ? 28 + b * 42 : 20)) * scale;
    if (l.cinematic?.style === 'cone') {
      const c = l.cinematic,
        u = (age + 0.1) % 1,
        reach = (c.reachFeet / 5) * 66 * scale,
        across = (a - 0.5) * (c.widthFeet / 5) * 66 * scale * u;
      at = offset({
        x: from.x + Math.cos(angle) * reach * u - Math.sin(angle) * across,
        y: from.y + Math.sin(angle) * reach * u + Math.cos(angle) * across,
      });
      sz = l.cinematic.element === 'ice' ? (1 + a * 3) * scale : (8 + a * 12) * scale;
      alpha *= Math.sin(u * Math.PI);
      height = (8 + u * 30) * scale;
    }
    const flame = l.variant === 'fire' || l.variant === 'flame' || l.cinematic?.element === 'fire',
      ice = l.variant === 'shards' || l.cinematic?.element === 'ice';
    const tile = mist
      ? 0
      : flame
        ? 4
        : ice
          ? 5
          : l.variant === 'embers'
            ? 2
            : l.kind === 'lightning'
              ? 7
              : i % 4 === 0
                ? 6
                : 1;
    const vx = at.x - f.anchor.x;
    const vy = at.y - f.anchor.y;
    const vz = height - 6 * scale;
    out.particles.push({
      ...point(at, height),
      size: Math.max(0.1, flame ? Math.max(sz, 6 * scale) : sz),
      alpha: Math.max(0, alpha),
      tile,
      rotation: q.rotation,
      stretch: flame && l.kind === 'burst' ? Math.min(2.1, q.stretch * 0.55) : q.stretch,
      color: i % 3 === 0 ? l.secondaryColor : l.color,
      dirX: vx,
      dirY: vz,
      dirZ: vy,
    });
  }
  return out;
}

export function evaluateNativeEffect(
  def: EffectDefinition,
  time: number,
  from: FxPoint,
  to: FxPoint,
  scale = 1,
  targets: FxPoint[] = [to],
  world: EffectWorld = {}
): NativeLayerFrame[] {
  let effectiveTarget = to;
  if (world.walls?.length) {
    const projLayer = def.layers.find((l) => l.enabled && l.kind === 'projectile' && !l.mageHand && !l.missile);
    if (projLayer) {
      const baseArc =
        projLayer.projectileCore?.arc ?? defaultProjectileCoreForVariant(projLayer.variant, projLayer.color).arc;
      const contact = fireballContact(from, to, baseArc, scale, world.walls);
      if (contact.fraction < 0.999) {
        effectiveTarget = contact.point;
      }
    }
  }
  return def.layers.map((l) =>
    evaluateNativeLayer(
      l,
      time,
      from,
      l.anchor === 'target' ? effectiveTarget : to,
      scale,
      targets,
      world
    )
  );
}
