import catalog from './core-layer-controls.json';
import { EffectLayer } from './effect-definition';
import { hasAuraRibbons } from './aura-settings';
export interface LayerControl {key:string;label:string;group:string;min:number;max:number;step:number;source:string;}
export function layerControls(l:EffectLayer):LayerControl[] {
 const profile=catalog.families[l.kind];
 let keys:string[]=[...profile.controls];
 if(hasAuraRibbons(l))keys=catalog.overrides['aura-ribbons'].controls;
 if(l.cinematic?.style==='cone')keys=['intensity','count','speed','lifetime','seed','direction'];
 if(l.mageHand)keys=['size','intensity'];
 else if(l.missile)keys=['size','intensity','seed'];
 else if(l.fireMaterial||l.fireHit)keys=['size','intensity','seed'];
 else if(l.kind==='projectile'&&l.projectileCore)keys=['size','intensity','count','speed','turbulence','drag','trail','seed'];
 if(l.particular?.enabled && !keys.includes('count'))keys=[...keys,'count'];
 const exclusions=(catalog.variantExclusions as Record<string,Record<string,string[]>>)[l.kind]?.[l.variant]??[];
 return catalog.controls.filter(c=>keys.includes(c.key)&&!exclusions.includes(c.key));
}
export function supportsParticular(l:EffectLayer):boolean {return catalog.families[l.kind].particular && !l.mageHand && !l.missile && !l.fireHit && !l.fireMaterial;}
