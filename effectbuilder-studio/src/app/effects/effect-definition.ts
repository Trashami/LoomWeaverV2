import { AuraSettings, parseAura } from './aura-settings';
import { LightSettings, LIGHT_DEFAULTS, parseLight } from './spell-light-settings';
import {
  ProjectileCoreSettings,
  ProjectileElement,
  ProjectileCoreShape,
  PROJECTILE_ELEMENTS,
  PROJECTILE_SHAPES,
  PROJECTILE_CORE_DEFAULTS,
  PROJECTILE_CORE_CONTROLS,
  defaultProjectileCoreForVariant,
  parseProjectileCore,
} from './projectile-core';
import {
  SkyProjectileSettings,
  SkyBeamSettings,
  SkyLightningSettings,
  SKY_PROJECTILE_DEFAULTS,
  SKY_BEAM_DEFAULTS,
  SKY_LIGHTNING_DEFAULTS,
  SKY_ORIGIN_CONTROLS,
  SKY_BEAM_CONTROLS,
  SKY_LIGHTNING_CONTROLS,
  parseSkyProjectile,
  parseSkyBeam,
  parseSkyLightning,
} from './sky-effects';
import {
  ParticularSettings,
  ParticularSpriteType,
  ParticularEmitterType,
  ParticularSizeCurve,
  ParticularOpacityCurve,
  ParticularColorGradient,
  PARTICULAR_DEFAULTS,
  PARTICULAR_SPRITE_TYPES,
  PARTICULAR_EMITTER_TYPES,
  PARTICULAR_SIZE_CURVES,
  PARTICULAR_OPACITY_CURVES,
  PARTICULAR_COLOR_GRADIENTS,
  PARTICULAR_EMITTER_CONTROLS,
  PARTICULAR_PARTICLE_CONTROLS,
  PARTICULAR_PHYSICS_CONTROLS,
  PARTICULAR_AUX_CONTROLS,
  defaultParticularForLayer,
  parseParticular,
} from './particular-settings';
export {
  ProjectileCoreSettings,
  ProjectileElement,
  ProjectileCoreShape,
  PROJECTILE_ELEMENTS,
  PROJECTILE_SHAPES,
  PROJECTILE_CORE_DEFAULTS,
  PROJECTILE_CORE_CONTROLS,
  defaultProjectileCoreForVariant,
  parseProjectileCore,
  SkyProjectileSettings,
  SkyBeamSettings,
  SkyLightningSettings,
  SKY_PROJECTILE_DEFAULTS,
  SKY_BEAM_DEFAULTS,
  SKY_LIGHTNING_DEFAULTS,
  SKY_ORIGIN_CONTROLS,
  SKY_BEAM_CONTROLS,
  SKY_LIGHTNING_CONTROLS,
  parseSkyProjectile,
  parseSkyBeam,
  parseSkyLightning,
  ParticularSettings,
  ParticularSpriteType,
  ParticularEmitterType,
  ParticularSizeCurve,
  ParticularOpacityCurve,
  ParticularColorGradient,
  PARTICULAR_DEFAULTS,
  PARTICULAR_SPRITE_TYPES,
  PARTICULAR_EMITTER_TYPES,
  PARTICULAR_SIZE_CURVES,
  PARTICULAR_OPACITY_CURVES,
  PARTICULAR_COLOR_GRADIENTS,
  PARTICULAR_EMITTER_CONTROLS,
  PARTICULAR_PARTICLE_CONTROLS,
  PARTICULAR_PHYSICS_CONTROLS,
  PARTICULAR_AUX_CONTROLS,
  defaultParticularForLayer,
  parseParticular,
};
export interface CinematicSettings { style:'beam'|'cone'|'column'|'nova'|'cube'; element:'force'|'fire'|'ice'|'gas'|'radiant'|'lightning'|'acid'|'shadow'; reachFeet:number; widthFeet:number; bloom:number; smoke:number; }
export interface GameplaySettings { enabled:boolean; move:'none'|'push'|'pull'; feet:number; prone:boolean; impactMs:number; basis:'spell'|'feature'|'homebrew'; }
export const CINEMATIC_DEFAULTS:CinematicSettings={style:'cone',element:'fire',reachFeet:15,widthFeet:15,bloom:.8,smoke:.65};
export const GAMEPLAY_DEFAULTS:GameplaySettings={enabled:false,move:'none',feet:5,prone:false,impactMs:700,basis:'spell'};
export interface MageHandSettings { growth:number; wrist:number; wisps:number; path:{x:number;y:number}[]; }
export const MAGE_HAND_DEFAULTS:MageHandSettings={growth:.22,wrist:.7,wisps:.65,path:[]};
import { EASINGS, Easing, OpacityKeyframe } from '../shared/animation/animation-curves';
import { EXTENDED_EFFECT_KINDS, EXTENDED_VARIANTS } from './core-effect-extensions';
export const BASE_EFFECT_KINDS = ['beam', 'lightning', 'projectile', 'burst', 'aura', 'sparks', 'ring', 'cone', 'wall', 'cloud', 'sigil', 'tether', 'whip'] as const;
export const EFFECT_KINDS = [...BASE_EFFECT_KINDS, ...EXTENDED_EFFECT_KINDS] as const;
export type EffectKind = typeof EFFECT_KINDS[number];
export const VARIANTS: Record<EffectKind, readonly { id: string; name: string; description: string }[]> = {
  ...EXTENDED_VARIANTS,
  beam: [
    { id: 'straight', name: 'Focused beam', description: 'A clean, concentrated ray of light.' },
    { id: 'wave', name: 'Energy wave', description: 'A broad, undulating stream.' },
    { id: 'ribbon', name: 'Silk ribbons', description: 'Three luminous ribbons weaving together.' },
    { id: 'pulse', name: 'Pulse train', description: 'Separated energy packets along the path.' },
    { id: 'helix', name: 'Double helix', description: 'Twin strands coiling around a bright core.' }],
  lightning: [
    { id: 'arc', name: 'Electric arc', description: 'A single jagged discharge.' },
    { id: 'branch', name: 'Branching storm', description: 'An arc shedding smaller electric branches.' },
    { id: 'fork', name: 'Forked lightning', description: 'Multiple bolts fanning out toward the target.' },
    { id: 'chain', name: 'Chain discharge', description: 'Linked nodes with connecting electric jumps.' },
    { id: 'plasma', name: 'Plasma stream', description: 'A thick, turbulent bundle of unstable filaments.' }],
  projectile: [
    { id: 'orb', name: 'Arcane orb', description: 'A glowing sphere with a soft trailing wake.' },
    { id: 'comet', name: 'Comet', description: 'An elongated core and streaming tail.' },
    { id: 'meteor', name: 'Burning meteor', description: 'A heavy fireball shedding glowing fragments.' },
    { id: 'shard', name: 'Crystal shard', description: 'An angular, spinning lance of light.' },
    { id: 'swarm', name: 'Seeking swarm', description: 'A flock of smaller projectiles on separate paths.' }],
  burst: [
    { id: 'radial', name: 'Energy nova', description: 'An expanding sphere with radial rays.' },
    { id: 'fire', name: 'Fire bloom', description: 'Rolling flame lobes and a hot central flash.' },
    { id: 'shatter', name: 'Crystal shatter', description: 'Sharp fragments flung out from the impact.' },
    { id: 'cone', name: 'Directed blast', description: 'A fan of force traveling in one direction.' },
    { id: 'implosion', name: 'Implosion', description: 'Fragments collapse toward a contracting core.' }],
  aura: [
    { id: 'halo', name: 'Sacred halo', description: 'A breathing circular field with delicate motes.' },
    { id: 'vortex', name: 'Arcane vortex', description: 'Rotating spiral arms gathering around the subject.' },
    { id: 'flame', name: 'Flame mantle', description: 'Rising tongues of fire surrounding the subject.' },
    { id: 'mist', name: 'Spirit mist', description: 'Soft drifting clouds and scattered light.' },
    { id: 'orbit', name: 'Celestial orbit', description: 'Bright satellites following crossing elliptical paths.' }],
  sparks: [
    { id: 'twirl', name: 'Twirl', description: 'Spiraling motes circling the emitter.' },
    { id: 'fire', name: 'Fire spray', description: 'Dense, flickering tongues of flame.' },
    { id: 'embers', name: 'Drifting embers', description: 'Slow glowing cinders with curling trails.' },
    { id: 'pushback', name: 'Pushback blast', description: 'Fast directional streaks in a controlled cone.' },
    { id: 'fountain', name: 'Spark fountain', description: 'An arcing spray pulled down by gravity.' }],
  ring: [
    { id: 'shockwave', name: 'Shockwave', description: 'A single expanding ring of force.' },
    { id: 'ripple', name: 'Concentric ripples', description: 'Repeated waves expanding from the center.' },
    { id: 'runes', name: 'Runic circle', description: 'Rotating geometric marks on a magic circle.' },
    { id: 'spiral', name: 'Spiral seal', description: 'An expanding, winding spiral.' },
    { id: 'portal', name: 'Portal', description: 'An elliptical doorway with orbiting sparks.' }],
  cone: [{ id: "flame", name: "Dragon flame", description: "Rolling tongues of flame in a widening fan." },
{ id: "frost", name: "Frozen breath", description: "A cone of crystalline frost needles." },
{ id: "poison", name: "Venom spray", description: "Drifting poison droplets in a directed spray." },
{ id: "force", name: "Force wave", description: "Curved pressure fronts pushing outward." },
{ id: "shards", name: "Shard volley", description: "A fan of angular magical fragments." }],
  wall: [{ id: "force", name: "Force barrier", description: "A luminous segmented force screen." },
{ id: "fire", name: "Wall of flame", description: "An undulating curtain of rising flames." },
{ id: "ice", name: "Glacial wall", description: "A row of sharp interlocking ice pillars." },
{ id: "thorns", name: "Briar wall", description: "Twisting branches with protruding thorns." },
{ id: "stone", name: "Stone rampart", description: "Staggered slabs forming a solid barrier." }],
  cloud: [{ id: "fog", name: "Rolling fog", description: "Soft overlapping banks of drifting mist." },
{ id: "poison", name: "Miasma", description: "Bubbling clouds and suspended droplets." },
{ id: "storm", name: "Storm cell", description: "A turbulent cloud threaded with lightning." },
{ id: "darkness", name: "Umbral field", description: "A dark disk with a curling luminous boundary." },
{ id: "blizzard", name: "Snow squall", description: "Wind-driven ice flakes crossing a misty field." }],
  sigil: [{ id: "ward", name: "Warding seal", description: "A geometric shield within a double circle." },
{ id: "runic", name: "Runic inscription", description: "Orbiting angular runes around a magic seal." },
{ id: "summoning", name: "Summoning star", description: "An animated pentagram and concentric rings." },
{ id: "banishment", name: "Banishment cross", description: "Rotating crossed diamonds closing a planar seal." },
{ id: "teleport", name: "Teleport lattice", description: "A rotating hexagonal transit lattice." }],
  tether: [{ id: "chain", name: "Spectral chain", description: "Interlocking links connecting caster and target." },
{ id: "vine", name: "Grasping vines", description: "Winding tendrils with small pointed leaves." },
{ id: "arcane", name: "Arcane binding", description: "Braided filaments with pulsing binding knots." },
{ id: "soul", name: "Soul drain", description: "Motes flowing back toward the caster." },
{ id: "gravity", name: "Gravity link", description: "Warped elliptical nodes along a force cord." }],
  whip: [
    { id: 'vine', name: 'Thorn vine', description: 'A green living vine with sharp thorns: overhead wind-up, strike, and pullback.' },
    { id: 'chain', name: 'Eldritch chain', description: 'Linked magical chain with the same customizable whip choreography.' },
    { id: 'flame', name: 'Flame lash', description: 'A burning lash with flickering flame tips.' },
    { id: 'lightning', name: 'Storm lash', description: 'A crackling electrical whip.' },
    { id: 'ribbon', name: 'Arcane ribbon', description: 'A flowing silk-like ribbon of magic.' }]
};
export interface WhipSettings { reach: number; backswing: number; height: number; curl: number; thorns: number; thornSize: number; windup: number; strike: number; hold: number; retract: number; }
export const WHIP_DEFAULTS: WhipSettings = { reach: 1, backswing: .85, height: 1, curl: 1, thorns: 16, thornSize: 7, windup: 28, strike: 40, hold: 0, retract: 32 };
export const WHIP_CONTROLS: readonly { key: keyof WhipSettings; label: string; min: number; max: number; step: number }[] = [
 {key:'reach',label:'Reach / target distance',min:.25,max:1.5,step:.05},
 {key:'backswing',label:'Backswing distance',min:0,max:2,step:.05},
 {key:'height',label:'Overhead swing height',min:.2,max:2,step:.05},
 {key:'curl',label:'Whip curl',min:0,max:3,step:.1},
 {key:'thorns',label:'Thorn count',min:0,max:40,step:1},
 {key:'thornSize',label:'Thorn size',min:0,max:20,step:1},
 {key:'windup',label:'Wind-up timing weight',min:5,max:70,step:1},
 {key:'strike',label:'Strike timing weight',min:5,max:70,step:1},
 {key:'retract',label:'Retraction timing weight',min:5,max:70,step:1}];
export const BLEND_MODES = ['normal', 'add', 'screen', 'multiply', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten', 'difference'] as const;
export type EffectBlendMode = typeof BLEND_MODES[number];
export interface EffectMotion {
  direction: number; cone: number; speed: number; twirl: number; turbulence: number;
  gravity: number; drag: number; lifetime: number; trail: number; seed: number;
}
export interface PreviewPoint { x: number; y: number; }
export interface TeleportPreview { enabled:boolean; vanishMs:number; hiddenMs:number; appearMs:number; destination:PreviewPoint; }
export const TELEPORT_DEFAULTS:TeleportPreview={enabled:true,vanishMs:650,hiddenMs:700,appearMs:650,destination:{x:.78,y:.52}};
export interface PreviewScene { teleport?:TeleportPreview; caster: PreviewPoint; targets: PreviewPoint[]; targetMotion?:boolean; walls?:{a:PreviewPoint;b:PreviewPoint}[]; }
export const defaultScene = (): PreviewScene => ({caster:{x:.22,y:.52},targets:[{x:.78,y:.52},{x:.72,y:.27},{x:.82,y:.78}]});
export interface MagicMissileSettings { targets: number[]; smokeColor: string; rise: number; curve: number; smokeLife: number; smokeOpacity: number; smokeSpread: number; launchGap: number; impactSize: number; }
export const MISSILE_DEFAULTS: MagicMissileSettings = {targets:[0,1,2],smokeColor:'#a59ad9',rise:55,curve:85,smokeLife:700,smokeOpacity:.45,smokeSpread:8,launchGap:90,impactSize:18};
export const MISSILE_CONTROLS: readonly {key: Exclude<keyof MagicMissileSettings,'targets'|'smokeColor'>;label:string;min:number;max:number;step:number}[] = [
 {key:'rise',label:'Overhead rise',min:10,max:150,step:1},{key:'curve',label:'Flight curvature',min:-160,max:160,step:1},
 {key:'smokeLife',label:'Smoke persistence (ms)',min:100,max:1500,step:50},{key:'smokeOpacity',label:'Smoke opacity',min:0,max:1,step:.05},
 {key:'smokeSpread',label:'Smoke spread',min:1,max:25,step:1},{key:'launchGap',label:'Bolt launch stagger (ms)',min:0,max:300,step:10},
 {key:'impactSize',label:'Impact burst size',min:3,max:40,step:1}];
export interface FireHitSettings { smokeColor:string; smoke:number; light:number; shadows:number; turbulence:number; embers:number; }
export const FIRE_HIT_DEFAULTS:FireHitSettings={smokeColor:'#4a4149',smoke:.7,light:1,shadows:.65,turbulence:.8,embers:1};
export const FIRE_HIT_CONTROLS:readonly {key:Exclude<keyof FireHitSettings,'smokeColor'>;label:string;min:number;max:number;step:number}[]=[
 {key:'smoke',label:'Smoke density',min:0,max:1,step:.05},{key:'light',label:'Light intensity',min:0,max:2,step:.05},{key:'shadows',label:'Shadow strength',min:0,max:1,step:.05},{key:'turbulence',label:'Flame turbulence',min:0,max:2,step:.05},{key:'embers',label:'Ember brightness',min:0,max:2,step:.05}];
export function createFireHitEffect():EffectDefinition {
 const e=createEffect('Inferno Impact','burst');
 e.spellName='Fireball';
 e.description='True 3D Inferno Impact: expanding molten fireball core, buoyant Trapcode Particular flame tongues & volumetric smoke plume, supersonic thermal shockwave, and erupting magma slag.';
 const detonation=e.layers[0];
 Object.assign(detonation,{
  variant:'fire',
  anchor:'target',
  color:'#ff5a14',
  secondaryColor:'#fff4c2',
  size:108,
  count:92,
  delay:0,
  duration:2250,
  fireHit:{...FIRE_HIT_DEFAULTS,smoke:.78,light:1.35,turbulence:1.15,embers:1.45},
  particular:{...defaultParticularForLayer('burst','fire','#ff5a14'),velocity:132,particleSize:24,auxEmitRate:2,auxSpriteType:'ember_sparks'}
 });
 const shockwave=createLayer('ring');
 Object.assign(shockwave,{
  variant:'shockwave',
  anchor:'target',
  color:'#ff7b29',
  secondaryColor:'#fff6d1',
  size:122,
  count:64,
  delay:0,
  duration:1150,
  blendMode:'screen'
 });
 const magma=createLayer('eruption');
 Object.assign(magma,{
  variant:'lava_pillar',
  anchor:'target',
  color:'#ff4508',
  secondaryColor:'#ffe89e',
  size:94,
  count:68,
  delay:40,
  duration:1950,
  particular:{
   ...defaultParticularForLayer('burst','fire','#ff4508'),
   emitterType:'disc',
   emitterSizeX:42,
   emitterSizeY:42,
   emitterSizeZ:16,
   spriteType:'molten_slag',
   particleSize:16,
   velocity:110,
   gravity:72,
   windY:18,
   floorBounce:0.55,
   auxEmitRate:1,
   auxSpriteType:'ember_sparks'
  }
 });
 e.layers=[detonation,shockwave,magma];
 return e;
}
export interface FireMaterialSettings extends FireHitSettings {role:'caster'|'projectile'|'impact';trail:number;arc:number;bloom:number;distortion:number;scorch:number;}
export const FIRE_MATERIAL_DEFAULTS:FireMaterialSettings={...FIRE_HIT_DEFAULTS,role:'impact',trail:1,arc:-55,bloom:.65,distortion:.45,scorch:.7};
export const FIRE_MATERIAL_CONTROLS:readonly {key:Exclude<keyof FireMaterialSettings,'role'|'smokeColor'>;label:string;min:number;max:number;step:number}[]=[...FIRE_HIT_CONTROLS,{key:'trail',label:'Trail persistence',min:.2,max:2,step:.05},{key:'arc',label:'Flight arc',min:-180,max:180,step:1},{key:'bloom',label:'Bloom strength',min:0,max:1.5,step:.05},{key:'distortion',label:'Heat shimmer',min:0,max:1,step:.05},{key:'scorch',label:'Scorch / ground mark',min:0,max:1,step:.05}];
export function createFireballComposition(role?:FireMaterialSettings['role']):EffectDefinition{
 const e=createEffect(role==='caster'?'Furnace Invocation':role==='impact'?'Pyroclasm Impact':'Fireball / Pyroclasm');
 e.spellName='Fireball';
 e.description='True 3D Pyroclasm: 3D convection fire vortex, 3D molten comet core with coiling fire ribbons, and 3D Trapcode Particular detonation with buoyant flame plumes, lava slag, and shockwave.';
 const makeCaster=()=>{
  const l=createLayer('aura');
  Object.assign(l,{
   variant:'flame',
   anchor:'caster',
   color:'#ff5b16',
   secondaryColor:'#fff1bd',
   size:68,
   count:78,
   delay:0,
   duration:1150,
   particular:{...defaultParticularForLayer('aura','flame','#ff5b16'),velocity:68,particleSize:19,spinAmplitude:3.1,auxEmitRate:1}
  });
  return l;
 };
 const makeCasterVortex=()=>{
  const l=createLayer('vortex');
  Object.assign(l,{
   variant:'fire_tornado',
   anchor:'caster',
   color:'#ff6e24',
   secondaryColor:'#fff5cc',
   size:64,
   count:64,
   delay:0,
   duration:1150,
   blendMode:'screen'
  });
  return l;
 };
 const makeProj=()=>{
  const l=createLayer('projectile');
  Object.assign(l,{
   variant:'meteor',
   anchor:'path',
   color:'#ff5b16',
   secondaryColor:'#fff1bd',
   size:26,
   count:80,
   delay:role?0:480,
   duration:1250,
   projectileCore:{...PROJECTILE_CORE_DEFAULTS,element:'fire',shape:'comet',arc:-52,coreScale:1.22,coronaSize:1.5,spinSpeed:2.4,orbitCount:3,wakeRibbons:3,wakeLength:1.2}
  });
  return l;
 };
 const impactDelay=role?0:1580;
 const makeImpact=()=>{
  const l=createLayer('burst');
  Object.assign(l,{
   variant:'fire',
   anchor:'target',
   color:'#ff5510',
   secondaryColor:'#fff4c4',
   size:118,
   count:96,
   delay:impactDelay,
   duration:2250,
   fireHit:{...FIRE_HIT_DEFAULTS,smoke:.76,light:1.4,turbulence:1.2,embers:1.5},
   particular:{
    ...defaultParticularForLayer('burst','fire','#ff5510'),
    emitterType:'sphere',
    emitterSizeX:38,
    emitterSizeY:38,
    emitterSizeZ:32,
    velocity:138,
    velocityRandom:55,
    spriteType:'flame_tongues',
    particleSize:25,
    sizeOverLife:'sharp_pop',
    opacityOverLife:'flash_decay',
    colorOverLife:'fire_gradient',
    gravity:-48,
    windY:42,
    turbulencePosition:46,
    spinAmplitude:1.6,
    floorBounce:0.45,
    auxEmitRate:2,
    auxSpriteType:'ember_sparks',
    auxSizeScale:0.3
   }
  });
  return l;
 };
 const makeEruption=()=>{
  const l=createLayer('eruption');
  Object.assign(l,{
   variant:'lava_pillar',
   anchor:'target',
   color:'#ff4205',
   secondaryColor:'#ffeb9c',
   size:98,
   count:68,
   delay:impactDelay+35,
   duration:1950,
   particular:{
    ...defaultParticularForLayer('burst','fire','#ff4205'),
    emitterType:'disc',
    emitterSizeX:44,
    emitterSizeY:44,
    emitterSizeZ:18,
    spriteType:'molten_slag',
    particleSize:16,
    velocity:115,
    gravity:68,
    windY:22,
    floorBounce:0.55,
    auxEmitRate:1,
    auxSpriteType:'ember_sparks'
   }
  });
  return l;
 };
 const makeWave=()=>{
  const l=createLayer('ring');
  Object.assign(l,{
   variant:'shockwave',
   anchor:'target',
   color:'#ff8438',
   secondaryColor:'#fff4c8',
   size:124,
   count:58,
   delay:impactDelay,
   duration:1250,
   blendMode:'screen'
  });
  return l;
 };
 e.layers=
  role==='caster'
   ?[makeCaster(),makeCasterVortex()]
   :role==='projectile'
    ?[makeProj()]
    :role==='impact'
     ?[makeImpact(),makeEruption(),makeWave()]
     :[makeCaster(),makeProj(),makeImpact(),makeEruption(),makeWave()];
 return e;
}
export interface EffectLayer {
 aura?: AuraSettings;
  lighting?: LightSettings; id: string; kind: EffectKind; variant: string; particular?:ParticularSettings; projectileCore?:ProjectileCoreSettings; skyProjectile?:SkyProjectileSettings; skyBeam?:SkyBeamSettings; skyLightning?:SkyLightningSettings; cinematic?:CinematicSettings; mageHand?:MageHandSettings; missile?: MagicMissileSettings; fireHit?:FireHitSettings; fireMaterial?:FireMaterialSettings; motion: EffectMotion; whip: WhipSettings; blendMode: EffectBlendMode; opacity: number; easing: Easing; opacityKeyframes: OpacityKeyframe[];
  color: string; secondaryColor: string; delay: number; duration: number; size: number;
  offsetX: number; offsetY: number; intensity: number; spread: number; count: number; enabled: boolean; anchor: 'caster' | 'target' | 'path';
}
export interface SummonSettings { campaignId: number; npcId: number; name: string; tokenUrl: string; delay: number; size: number; }
export interface EffectDefinition { gameplay?:GameplaySettings; summon?: SummonSettings; schemaVersion: 1; id: string; name: string; description: string; spellName: string; layers: EffectLayer[]; previewScene: PreviewScene; }
export interface EffectAssignment { spellName: string; characterId: number; definition: EffectDefinition; }
export const newId = () => crypto.randomUUID();
export const normalizeSpell = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
export function defaultMotion(kind: EffectKind, variant?: string): EffectMotion {
  return { direction: kind === 'whip' ? 0 : variant === 'fire' || variant === 'embers' || variant === 'fountain' || variant === 'flame' ? -90 : 0,
    cone: kind === 'cone' ? 65 : variant === 'pushback' || variant === 'cone' ? 45 : variant === 'fire' || variant === 'fountain' ? 65 : 360,
    speed: 1, twirl: kind === 'aura' && variant !== 'flame' && variant !== 'mist' || kind === 'sparks' && (!variant || variant === 'twirl') ? 1 : 0,
    turbulence: variant === 'fire' || variant === 'mist' ? 30 : 0, gravity: variant === 'fountain' ? 130 : 0,
    drag: 0.15, lifetime: 0.8, trail: 0.45, seed: 42 };
}
export function createLayer(kind: EffectKind): EffectLayer {
  const variant = VARIANTS[kind][0].id;
  const areaKinds = ['burst', 'aura', 'ring', 'cone', 'wall', 'cloud', 'sigil', 'shield', 'ground', 'emitter', 'vortex', 'portal', 'orbit', 'slash', 'symbol', 'eruption', 'distortion', 'sound'];
  return {
    ...(kind==='cone'?{cinematic:{...CINEMATIC_DEFAULTS}}:{}),
    ...(kind==='projectile'?{projectileCore:defaultProjectileCoreForVariant(variant,'#ff7a2e')}:{}),
    ...(kind==='sky_projectile'?{skyProjectile:{...SKY_PROJECTILE_DEFAULTS}}:{}),
    ...(kind==='sky_beam'?{skyBeam:{...SKY_BEAM_DEFAULTS}}:{}),
    ...(kind==='sky_lightning'?{skyLightning:{...SKY_LIGHTNING_DEFAULTS}}:{}),
    lighting: {...LIGHT_DEFAULTS}, id: newId(), kind, variant, whip: { ...WHIP_DEFAULTS }, blendMode: 'normal', opacity: 1, offsetX: 0, offsetY: 0, easing: 'linear', opacityKeyframes: [], motion: {...defaultMotion(kind, variant),...(kind==='cone'?{direction:0}:{})},
    color: kind === 'whip' ? '#369b45' : kind === 'projectile' || kind === 'sky_projectile' ? '#ff7a2e' : kind === 'sky_beam' ? '#ffd978' : kind === 'sky_lightning' ? '#7ab8ff' : '#62e5ad',
    secondaryColor: kind === 'whip' ? '#b5e878' : kind === 'projectile' || kind === 'sky_projectile' ? '#fff1bd' : kind === 'sky_beam' || kind === 'sky_lightning' ? '#ffffff' : '#e3fff4',
    delay: 0, duration: kind === 'whip' ? 2200 : 1200, size: areaKinds.includes(kind) ? 75 : kind === 'projectile' || kind === 'sky_projectile' || kind === 'sky_beam' ? 22 : kind === 'sky_lightning' ? 18 : 8,
    intensity: 0.9, spread: 55, count: 40, enabled: true, anchor: ['cone', 'slash', 'shield'].includes(kind) ? 'caster' : ['beam', 'lightning', 'projectile', 'tether', 'whip', 'chain_lightning', 'trail'].includes(kind) ? 'path' : 'target' };
}
export function createEffect(name = 'Untitled effect', kind: EffectKind = 'beam'): EffectDefinition {
  return { schemaVersion: 1, id: newId(), name, description: '', spellName: 'Eldritch Blast', layers: [createLayer(kind)], previewScene: defaultScene() };
}
export function effectDuration(effect: EffectDefinition): number {
  return Math.max(1000, effect.previewScene.teleport?.enabled ? effect.previewScene.teleport.vanishMs+effect.previewScene.teleport.hiddenMs+effect.previewScene.teleport.appearMs+800 : 0, effect.gameplay?.enabled ? effect.gameplay.impactMs+350 : 0, effect.summon?.delay ?? 0, ...effect.layers.map(l => l.delay + l.duration));
}
export function bounded(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function parseEffect(value: unknown): EffectDefinition {
  if (!value || typeof value !== 'object') throw new Error('Expected an effect object.');
  const rawObj = value as Record<string, unknown>;
  const e = rawObj['effect'] && typeof rawObj['effect'] === 'object' && !rawObj['layers']
    ? (rawObj['effect'] as Record<string, unknown>)
    : rawObj;
  if (e['schemaVersion'] !== 1 || typeof e['name'] !== 'string' || !e['name'].trim() || !Array.isArray(e['layers']) || e['layers'].length > 16)
    throw new Error('Use a version 1 effect with a name and at most 16 layers.');
  const color = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#62e5ad';
  const defaultsScene=defaultScene();
  const scenePoint=(p: any, fallback: PreviewPoint): PreviewPoint => ({x:bounded(p?.x,-.35,1.35,fallback.x),y:bounded(p?.y,-.35,1.35,fallback.y)});
  const rawScene=e['previewScene'] as any;
  const previewScene:PreviewScene={...(rawScene?.teleport?{teleport:{enabled:rawScene.teleport.enabled===true,vanishMs:bounded(rawScene.teleport.vanishMs,100,2500,650),hiddenMs:bounded(rawScene.teleport.hiddenMs,100,2500,700),appearMs:bounded(rawScene.teleport.appearMs,100,2500,650),destination:scenePoint(rawScene.teleport.destination,TELEPORT_DEFAULTS.destination)}}:{}),targetMotion:rawScene?.targetMotion===true,walls:Array.isArray(rawScene?.walls)?rawScene.walls.slice(0,8).map((w:any)=>({a:scenePoint(w.a,{x:.55,y:.25}),b:scenePoint(w.b,{x:.55,y:.75})})):[],caster:scenePoint(rawScene?.caster,defaultsScene.caster),targets:defaultsScene.targets.map((p,i)=>scenePoint(rawScene?.targets?.[i],p))};
  const layers = e['layers'].map((v: unknown): EffectLayer => {
    if (!v || typeof v !== 'object') throw new Error('Invalid layer.');
    const l = v as Record<string, unknown>, kind = l['kind'] as EffectKind;
    if (!EFFECT_KINDS.includes(kind)) throw new Error('Unknown layer type.');
    const variant = typeof l['variant'] === 'string' && VARIANTS[kind].some(v => v.id === l['variant']) ? l['variant'] : VARIANTS[kind][0].id;
    const m = l['motion'] && typeof l['motion'] === 'object' ? l['motion'] as Record<string, unknown> : {};
    const defaults = defaultMotion(kind, variant);
    let cinematic:CinematicSettings|undefined;
    if(l['cinematic']!==undefined){const raw=l['cinematic'] as any;if(!raw||!['beam','cone','column','nova','cube'].includes(raw.style)||!['force','fire','ice','gas','radiant','lightning','acid','shadow'].includes(raw.element)||l['mageHand']||l['missile']||l['fireHit']||l['fireMaterial'])throw new Error('Choose one supported cinematic material per layer.');cinematic={style:raw.style,element:raw.element,reachFeet:bounded(raw.reachFeet,5,120,15),widthFeet:bounded(raw.widthFeet,1,120,15),bloom:bounded(raw.bloom,0,1.5,.8),smoke:bounded(raw.smoke,0,1,.65)};}
    let mageHand:MageHandSettings|undefined;
    if(l['mageHand']!==undefined){const raw=l['mageHand'] as any;if(kind!=='projectile'||!raw||l['missile']||l['fireMaterial']||!Array.isArray(raw.path)||raw.path.length>8||raw.path.some((p:any)=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<-.5||p.x>1.5||Math.abs(p.y)>1))throw new Error('Mage Hand needs a projectile and up to eight valid path points.');mageHand={growth:bounded(raw.growth,.05,.6,.22),wrist:bounded(raw.wrist,0,1,.7),wisps:bounded(raw.wisps,0,1,.65),path:raw.path.map((p:any)=>({x:p.x,y:p.y}))};}
    let missile: MagicMissileSettings | undefined;
    if(l['missile']!==undefined) {
      if(kind!=='projectile'||!l['missile']||typeof l['missile']!=='object')throw new Error('Magic Missile requires a projectile layer.');
      const raw=l['missile'] as any;
      if(!Array.isArray(raw.targets)||raw.targets.length!==3||raw.targets.some((n:unknown)=>!Number.isInteger(n)||Number(n)<0||Number(n)>2))throw new Error('Assign exactly three bolts to target slots 1–3.');
      missile={...MISSILE_DEFAULTS,targets:[...raw.targets],smokeColor:color(raw.smokeColor)};
      for(const c of MISSILE_CONTROLS)missile[c.key]=bounded(raw[c.key],c.min,c.max,MISSILE_DEFAULTS[c.key]);
    }
    let fireHit:FireHitSettings|undefined;
    if(l['fireHit']!==undefined){if(kind!=='burst'||!l['fireHit']||typeof l['fireHit']!=='object')throw new Error('Fire hit requires a burst layer.');const raw=l['fireHit'] as any;fireHit={...FIRE_HIT_DEFAULTS,smokeColor:typeof raw.smokeColor==='string'&&/^#[0-9a-f]{6}$/i.test(raw.smokeColor)?raw.smokeColor:FIRE_HIT_DEFAULTS.smokeColor};for(const c of FIRE_HIT_CONTROLS)fireHit[c.key]=bounded(raw[c.key],c.min,c.max,FIRE_HIT_DEFAULTS[c.key]);}
    let fireMaterial:FireMaterialSettings|undefined;
    if(l['fireMaterial']!==undefined){if(l['fireHit']!==undefined||l['missile']!==undefined)throw new Error('Use one renderer material per layer.');const raw=l['fireMaterial'] as any;const kinds:Record<string,string>={caster:'aura',projectile:'projectile',impact:'burst'};if(!raw||kinds[raw.role]!==kind)throw new Error('Fire material role must match its layer type.');if(raw.role!=='projectile'){fireMaterial={...FIRE_MATERIAL_DEFAULTS,role:raw.role,smokeColor:typeof raw.smokeColor==='string'&&/^#[0-9a-f]{6}$/i.test(raw.smokeColor)?raw.smokeColor:FIRE_MATERIAL_DEFAULTS.smokeColor};for(const c of FIRE_MATERIAL_CONTROLS)fireMaterial[c.key]=bounded(raw[c.key],c.min,c.max,FIRE_MATERIAL_DEFAULTS[c.key]);}}
    const projectileCore = kind==='projectile'&&!mageHand&&!missile&&!cinematic?parseProjectileCore(l['projectileCore']??(l['fireMaterial']?{element:'fire',shape:'comet',arc:(l['fireMaterial'] as any)?.arc??-50}:undefined),variant,color(l['color'])):undefined;
    const skyProjectile = kind==='sky_projectile'?parseSkyProjectile(l['skyProjectile'],variant,color(l['color'])):undefined;
    const skyBeam = kind==='sky_beam'?parseSkyBeam(l['skyBeam']):undefined;
    const skyLightning = kind==='sky_lightning'?parseSkyLightning(l['skyLightning']):undefined;
    const particular = l['particular']!==undefined?parseParticular(l['particular'],kind,variant,color(l['color'])):undefined;
    const rawFrames = l['opacityKeyframes'] ?? [];
    if (!Array.isArray(rawFrames) || rawFrames.length > 32) throw new Error('Use at most 32 opacity keyframes per layer.');
    const opacityKeyframes: OpacityKeyframe[] = rawFrames.map((f: any) => {
      if (!f || typeof f !== 'object' || typeof f.time !== 'number' || !Number.isFinite(f.time) || f.time < 0 || f.time > 1 || typeof f.value !== 'number' || !Number.isFinite(f.value) || f.value < 0 || f.value > 1) throw new Error('Opacity keyframes need a time and value between 0 and 1.');
      return { id: typeof f.id === 'string' && f.id ? f.id.slice(0,80) : newId(), time: f.time, value: f.value, easing: EASINGS.includes(f.easing) ? f.easing : 'linear' };
    }).sort((a,b) => a.time - b.time);
    if (new Set(opacityKeyframes.map(f => f.id)).size !== opacityKeyframes.length || opacityKeyframes.some((f,i) => i > 0 && f.time - opacityKeyframes[i-1].time < .000001)) throw new Error('Opacity keyframes must have unique IDs and distinct times.');
    const rawWhip = l['whip'] && typeof l['whip'] === 'object' ? l['whip'] as Record<string, unknown> : {};
    const whip = { ...WHIP_DEFAULTS };
    for (const c of WHIP_CONTROLS) whip[c.key] = bounded(rawWhip[c.key], c.min, c.max, WHIP_DEFAULTS[c.key]);
    whip.thorns = Math.round(whip.thorns); whip.hold = 0;
    return { ...(kind==='aura'?{aura:parseAura(l['aura'],variant)}:{}), lighting: parseLight(l['lighting']), id: typeof l['id'] === 'string' && l['id'] ? l['id'].slice(0, 80) : newId(), kind, variant, ...(particular ? {particular} : {}), ...(projectileCore ? {projectileCore} : {}), ...(skyProjectile ? {skyProjectile} : {}), ...(skyBeam ? {skyBeam} : {}), ...(skyLightning ? {skyLightning} : {}), ...(cinematic ? {cinematic} : {}), ...(mageHand ? {mageHand} : {}), ...(missile ? {missile} : {}), ...(fireHit ? {fireHit} : {}), ...(fireMaterial ? {fireMaterial} : {}), whip, easing: EASINGS.includes(l['easing'] as Easing) ? l['easing'] as Easing : 'linear', opacityKeyframes, blendMode: BLEND_MODES.includes(l['blendMode'] as EffectBlendMode) ? l['blendMode'] as EffectBlendMode : 'normal', opacity: bounded(l['opacity'], 0, 1, 1), offsetX: bounded(l['offsetX'], -200, 200, 0), offsetY: bounded(l['offsetY'], -200, 200, 0),
      motion: { direction: bounded(m['direction'], -180, 180, defaults.direction), cone: bounded(m['cone'], 0, 360, defaults.cone), speed: bounded(m['speed'], 0, 4, defaults.speed),
        twirl: bounded(m['twirl'], -6, 6, defaults.twirl), turbulence: bounded(m['turbulence'], 0, 100, defaults.turbulence), gravity: bounded(m['gravity'], -200, 200, defaults.gravity),
        drag: bounded(m['drag'], 0, 1, defaults.drag), lifetime: bounded(m['lifetime'], 0.1, 1, defaults.lifetime), trail: bounded(m['trail'], 0, 1, defaults.trail), seed: Math.round(bounded(m['seed'], 1, 9999, 42)) },
      color: color(l['color']), secondaryColor: color(l['secondaryColor']), delay: bounded(l['delay'], 0, 5000, 0), duration: bounded(l['duration'], 100, 5000, 800),
      size: bounded(l['size'], 1, 200, 7), intensity: bounded(l['intensity'], 0, 1, 0.9), spread: bounded(l['spread'], 0, 150, 22), count: Math.round(bounded(l['count'], 1, 100, 24)),
      enabled: l['enabled'] !== false, anchor: (['caster', 'target', 'path'].includes(String(l['anchor'])) ? l['anchor'] : 'target') as EffectLayer['anchor'] };
  });
  if (new Set(layers.map(l => l.id)).size !== layers.length) throw new Error('Layer IDs must be unique.');
  let summon: SummonSettings | undefined;
  if(e['summon'] !== undefined) {
    const v=e['summon'] as SummonSettings;
    if(!v || !Number.isSafeInteger(v.campaignId)||v.campaignId<1||!Number.isSafeInteger(v.npcId)||v.npcId<1||typeof v.name!=='string'||!v.name.trim()||typeof v.tokenUrl!=='string'||!/^\/(?:uploads|assets|tokens|img|api\/summon-assets)\//.test(v.tokenUrl)||/[?#\\]/.test(v.tokenUrl)||v.tokenUrl.includes('..')||v.tokenUrl.length>1000||!Number.isInteger(v.delay)||v.delay<0||v.delay>5000||!Number.isFinite(v.size)||v.size<.25||v.size>4) throw new Error('Choose a campaign NPC and token, with appearance time 0–5000 ms and size 0.25–4 squares.');
    summon={campaignId:v.campaignId,npcId:v.npcId,name:v.name.slice(0,120),tokenUrl:v.tokenUrl,delay:v.delay,size:v.size};
  }
  let gameplay:GameplaySettings|undefined;
  if(e['gameplay']!==undefined){const r=e['gameplay'] as any;if(!r||typeof r.enabled!=='boolean'||typeof r.prone!=='boolean'||!['none','push','pull'].includes(r.move)||!['spell','feature','homebrew'].includes(r.basis)||![5,10].includes(r.feet)||!Number.isInteger(r.impactMs)||r.impactMs<0||r.impactMs>5000||r.prone&&r.basis!=='homebrew')throw new Error('Invalid gameplay rider. Prone requires an explicit homebrew rule.');gameplay={enabled:r.enabled,move:r.move,feet:r.feet,prone:r.prone,impactMs:r.impactMs,basis:r.basis};}
  return { ...(gameplay ? {gameplay} : {}), ...(summon ? {summon} : {}), schemaVersion: 1, id: typeof e['id'] === 'string' ? e['id'].slice(0, 80) : newId(), name: e['name'].trim().slice(0, 120), description: String(e['description'] ?? '').slice(0, 2000), spellName: String(e['spellName'] ?? '').slice(0, 120), layers, previewScene };
}
export function createMagicMissileEffect():EffectDefinition {
  const e=createEffect('Arcane Magic Missile','projectile');e.previewScene.caster.y=.68;e.spellName='Magic Missile';e.description='Three arcane bolts form overhead, rise, curve toward independently assigned targets, and leave colored smoke before small magical impacts.';
  Object.assign(e.layers[0],{color:'#b48cff',secondaryColor:'#f1e9ff',size:7,duration:2400,missile:{...MISSILE_DEFAULTS,targets:[...MISSILE_DEFAULTS.targets]}});return e;
}
export function makePresets(): EffectDefinition[] {
  const whip = createEffect('Verdant Thorn Whip', 'whip'); whip.spellName = 'Thorn Whip';
  return [createMagicMissileEffect(), whip, ... [['Emerald Eldritch', 'Eldritch Blast', 'beam', '#62e5ad'], ['Stormcaller', 'Lightning Bolt', 'lightning', '#85b8ff'],
    ['Cinderheart', 'Fireball', 'projectile', '#ff905c'], ['Moonlit Ward', 'Shield', 'aura', '#c4a1ff'], ['Winter Shard', 'Ray of Frost', 'projectile', '#89edff'], ['Golden Renewal', 'Cure Wounds', 'aura', '#f2d18c']].map(([name, spell, kind, color]) => {
      if(spell==='Fireball'){const fireball=createFireballComposition();fireball.name=name;return fireball;}
      const e = createEffect(name, kind as EffectKind); e.spellName = spell; e.layers[0].color = color;
      const l = createLayer('sparks'); l.delay = 700; l.duration = 900; l.color = color; e.layers.push(l); return e;
    })];
}

export function createMageHandEffect():EffectDefinition{const e=createEffect('Spectral Mage Hand');e.spellName='Mage Hand';e.description='A spectral hand forms at the caster and follows an editable route.';const l=createLayer('projectile');Object.assign(l,{color:'#34baff',secondaryColor:'#c9f6ff',size:70,duration:3000,blendMode:'screen',mageHand:{...MAGE_HAND_DEFAULTS,path:[]}});e.layers=[l];return e;}
