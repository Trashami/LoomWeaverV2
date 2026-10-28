export interface AuraSettings { strands:number; turns:number; height:number; width:number; rotation:number; motes:number; }
export const AURA_DEFAULTS: AuraSettings = {strands:3,turns:2.3,height:90,width:1,rotation:1,motes:24};
export function parseAura(value:unknown, variant='vortex'):AuraSettings {
 const raw=value && typeof value==='object'?value as Record<string,unknown>:{};
 const defaults={...AURA_DEFAULTS,turns:variant==='vortex'?2.3:1.1};
 const result={...defaults};
 const limits:Record<keyof AuraSettings,[number,number]>={strands:[1,8],turns:[0,6],height:[0,200],width:[.2,10],rotation:[-4,4],motes:[0,80]};
 for(const key of Object.keys(limits) as (keyof AuraSettings)[]) {const v=raw[key];result[key]=typeof v==='number'&&Number.isFinite(v)?Math.max(limits[key][0],Math.min(limits[key][1],v)):defaults[key];}
 result.strands=Math.round(result.strands);result.motes=Math.round(result.motes);return result;
}
export function hasAuraRibbons(layer:{kind:string;variant:string;fireMaterial?:unknown}):boolean {return layer.kind==='aura'&&!layer.fireMaterial&&['vortex','orbit','halo'].includes(layer.variant);}
