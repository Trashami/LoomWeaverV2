import { Color3 } from '@babylonjs/core';
import type { WaterProfile } from './water-profile';
import type { WaterSettings } from './water-settings';
export interface WaterField {
  coverage: number; level: number; depth: number; fall: number;
  dx: number; dz: number; speed: number; radius: number; settings: WaterSettings;
  shallow: readonly number[]; deep: readonly number[];
}
interface Hit { profile: WaterProfile; distance: number; level: number; dx: number; dz: number; fall: number; }
function hitProfile(profile: WaterProfile,x: number,z: number): Hit {
  let distance=Infinity,level=0,dx=1,dz=0,fall=0;
  const samples=profile.samples;
  if(samples.length===1) return {profile,distance:Math.hypot(x-samples[0].x,z-samples[0].z),
    level:samples[0].level,dx:0,dz:0,fall:0};
  for(let i=1;i<samples.length;i++) {
    const a=samples[i-1],b=samples[i],vx=b.x-a.x,vz=b.z-a.z,len=Math.hypot(vx,vz);
    const t=Math.max(0,Math.min(1,((x-a.x)*vx+(z-a.z)*vz)/Math.max(.0001,len*len)));
    const d=Math.hypot(x-a.x-vx*t,z-a.z-vz*t);
    if(d<distance) {distance=d;level=a.level+(b.level-a.level)*t;dx=vx/Math.max(.001,len);dz=vz/Math.max(.001,len);fall=Math.max(a.fall,b.fall);}
  }
  return {profile,distance,level,dx,dz,fall};
}
export function sampleWaterNetwork(profiles: readonly WaterProfile[],x: number,z: number): WaterField {
  const hits=profiles.map(p=>hitProfile(p,x,z)).sort((a,b)=>
    (b.profile.settings.width/2-b.distance)-(a.profile.settings.width/2-a.distance));
  const first=hits[0],s=first.profile.settings,radius=s.width/2;
  let coverage=radius-first.distance;
  const blend=radius*.6*s.bankFeathering/100+.04;
  if(hits[1]) {
    const second=hits[1].profile.settings.width/2-hits[1].distance;
    const h=Math.max(0,blend-Math.abs(coverage-second))/blend;
    coverage+=h*h*blend*.25;
  }
  // Only nearby contributors influence junction height, flow and materials.
  let weight=0,level=0,dx=0,dz=0,speed=0,fall=0;
  const shallow=[0,0,0],deep=[0,0,0];
  const mixed: { -readonly [K in keyof WaterSettings]: WaterSettings[K] }={...s};
  const numeric=['depth','bankWidth','bankFeathering','intensity','foam','opacity','reflectivity','waveHeight','waveScale','refraction'] as const;
  for(const key of numeric) mixed[key]=0;
  for(const hit of hits) {
    const signed=hit.profile.settings.width/2-hit.distance;
    if(signed < coverage-blend*2 && hit!==first) continue;
    const w=Math.exp(Math.max(-20,(signed-(radius-first.distance))/Math.max(.1,blend)));
    const setting=hit.profile.settings;
    weight+=w;level+=hit.level*w;dx+=hit.dx*w;dz+=hit.dz*w;fall+=hit.fall*w;
    speed+=(setting.mode==='pond'?0:setting.flowSpeed)*w;
    for(const key of numeric) mixed[key]+=setting[key]*w;
    const a=Color3.FromHexString(setting.shallowColor),b=Color3.FromHexString(setting.deepColor);
    shallow[0]+=a.r*w;shallow[1]+=a.g*w;shallow[2]+=a.b*w;
    deep[0]+=b.r*w;deep[1]+=b.g*w;deep[2]+=b.b*w;
  }
  for(const key of numeric) mixed[key]/=weight;
  for(let i=0;i<3;i++) {shallow[i]/=weight;deep[i]/=weight;}
  const length=Math.hypot(dx,dz);
  return {coverage,level:level/weight,depth:Math.max(0,1-Math.max(0,1-coverage/radius)**4),
    fall:fall/weight,dx:length>.001?dx/length:1,dz:length>.001?dz/length:0,
    speed:speed/weight,radius,settings:mixed,shallow,deep};
}

/** Connected footprints share a single surface; level-separated bridges remain independent. */
export function groupWaterNetworks(profiles: readonly WaterProfile[]): WaterProfile[][] {
  const groups: WaterProfile[][]=[];
  for(const profile of profiles.filter(p=>p.samples.length)) {
    const touching:number[]=[];
    for(let i=0;i<groups.length;i++) if(groups[i].some(other=>{
      const radius=(profile.settings.width+other.settings.width)/2+.15;
      return profile.samples.some(a=>other.samples.some(b=>Math.hypot(a.x-b.x,a.z-b.z)<radius
        && Math.abs(a.level-b.level)<Math.max(.5,Math.max(profile.settings.depth,other.settings.depth)*.3)));
    })) touching.push(i);
    const group=[profile];
    for(const i of touching.reverse()) group.push(...groups.splice(i,1)[0]);
    groups.push(group);
  }
  return groups;
}
