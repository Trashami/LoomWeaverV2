import { LwMonsterAssignmentVm, LwMonsterDetailVm, LW_MONSTER_PLACEHOLDER_IMAGE } from '../../../shared/ui/public-api';
import { EncounterMonsterSlotVm } from '../../encounters/models/encounter-studio.models';

/** Parses "+5 to hit" and "DC 13" from statblock action text; falls back to CR-appropriate defaults. */
function parseAttack(detail: LwMonsterDetailVm): { name: string; bonus: number; damage: string; saveDc: number } {
  const attack = detail.actions.find((a) => /to hit/i.test(a.text)) ?? detail.actions.find((a) => a.name !== 'Multiattack');
  const text = attack?.text ?? '';
  const bonus = Number(/([+-]\d+)\s*to hit/i.exec(text)?.[1] ?? NaN);
  const damage = /\(([\dd+\s-]+)\)/i.exec(text)?.[1]?.replace(/\s+/g, '') ?? '1d6';
  const allText = [...detail.actions, ...detail.traits].map((a) => a.text).join(' ');
  const saveDc = Number(/DC\s*(\d+)/i.exec(allText)?.[1] ?? NaN);
  const proficiency = 2 + Math.floor(Math.max(0, detail.summary.crValue - 1) / 4);
  return {
    name: attack?.name ?? 'Strike',
    bonus: Number.isFinite(bonus) ? bonus : proficiency + 3,
    damage,
    saveDc: Number.isFinite(saveDc) ? saveDc : 8 + proficiency + 2,
  };
}

/** Converts a bestiary statblock into an encounter roster slot, honoring the campaign's DM token assignment. */
export function buildEncounterMonsterSlot(
  detail: LwMonsterDetailVm,
  count: number,
  assignment: LwMonsterAssignmentVm | null,
): EncounterMonsterSlotVm {
  const s = detail.summary;
  const attack = parseAttack(detail);
  const tokenUrl = assignment?.primaryTokenUrl || s.tokenUrl || s.imageUrl || LW_MONSTER_PLACEHOLDER_IMAGE;
  const glb = assignment?.primaryModelUrl || undefined;
  return {
    slotId: `slot-bst-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    creatureId: s.key,
    name: s.name,
    creatureType: `${s.size} ${s.creatureType}`,
    challengeRating: s.challengeRating,
    xpValue: detail.experiencePoints,
    count,
    armorClass: s.armorClass,
    maxHp: s.hitPoints,
    speedFeet: Number(/(\d+)\s*ft/.exec(detail.speedLabel)?.[1] ?? 30),
    attackBonus: attack.bonus,
    saveDc: attack.saveDc,
    signatureAttack: attack.name,
    damageFormula: attack.damage,
    roleSummary: s.shortDescription,
    disposition: s.crValue >= 10 ? 'Boss' : 'Hostile',
    tokenAssetId: assignment?.primaryTokenUrl ? `assigned-${s.key}` : `bestiary-${s.key}`,
    tokenName: s.name,
    tokenKind: glb ? '3d' : '2d',
    tokenPreviewUrl: tokenUrl,
    tokenGlbUrl: glb,
  };
}
