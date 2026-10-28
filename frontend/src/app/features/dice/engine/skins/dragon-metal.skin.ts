import { DiceSkinConfig } from './dice-skin.types';
import { ENGRAVED_STEEL_SKIN } from './engraved-steel.skin';

export const HOLLOW_DRAGON_SKIN: DiceSkinConfig = {
  ...ENGRAVED_STEEL_SKIN,
  id: 'skin-hollow-dragon', name: 'Hollow Dragon Silver',
  tagline: 'Open silver dragons with raised gold numbers',
  materialFamily: 'Sculpted Silver', defaultModelId: 'model-dragon-hollow',
  baseColor: '#707780', accentColor: '#c7cbd0', borderColor: '#aeb5bc',
  textColor: '#ecc56c', textStrokeColor: '#725322', textStrokeWidth: 1,
  textStyle: 'raised', textEmissive: false, emissiveIntensity: 0,
  roughness: 0.27, metalness: 1, bumpScale: 0.008
};

export const DRAGON_EYE_SKIN: DiceSkinConfig = {
  ...ENGRAVED_STEEL_SKIN,
  id: 'skin-dragon-eye', name: 'Emerald Dragon Eye',
  tagline: 'Gunmetal scales with an emerald eye for the natural 20',
  materialFamily: 'Dragon Scale Steel', defaultModelId: 'model-dragon-eye',
  baseColor: '#434b50', accentColor: '#13bd78', borderColor: '#899398',
  textColor: '#38eb88', textStrokeColor: '#122b20', textStrokeWidth: 1.5,
  textEmissive: false, emissiveIntensity: 0,
  roughness: 0.33, metalness: 0.95, bumpScale: 0.006
};
