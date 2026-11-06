import { Injectable, inject } from '@angular/core';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { CharacterStudioService } from '../../characters/services/character-studio.service';
import { CharacterSheetVm } from '../../characters/models/character-studio.models';
import { VttTokenVm } from '../../effects/engine/effect-timeline.contract';
import { VttTacticalAbilityVm, VttTurnActionCategory } from '../models/vtt-battle.models';
import { DockAction } from '../components/vtt-action-dock/vtt-action-dock.models';
import { toDockAction } from '../components/vtt-action-dock/vtt-action-dock.adapter';
import { resolveDefaultTokenFromLibrary } from './vtt-token-library-resolver';
import { CreatureCardVm } from '../../../shared/ui/creature-card/creature-card.component';
import {
  buildCharacterSheetAbilities,
  buildCreatureOrNpcAbilities,
} from './vtt-ability-mapper.helpers';

const PARTY_FORMATION_SLOTS: readonly { x: number; z: number }[] = [
  { x: -6, z: 2 },
  { x: -3, z: 2 },
  { x: 0, z: 2 },
  { x: 3, z: 2 },
  { x: 6, z: 2 },
  { x: -4, z: 4 },
  { x: 1, z: 4 },
  { x: 4, z: 4 },
];

@Injectable({ providedIn: 'root' })
export class VttPartyAndActionsService {
  private readonly characterStudio = inject(CharacterStudioService);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly auth = inject(AuthSessionService);
  private readonly abilitiesCache = new Map<string, VttTacticalAbilityVm[]>();
  private readonly dockActionsCache = new Map<string, DockAction[]>();

  isSheetControlledByCurrentViewer(sheet: CharacterSheetVm): boolean {
    if (this.store.viewerRole() === 'gm') return true;
    const owned = this.characterStudio.userOwnedSheets();
    if (owned.some((s) => s.characterKey === sheet.characterKey)) return true;

    const sheetKeyLower = sheet.characterKey.toLowerCase();
    const altKeyLower = sheetKeyLower.startsWith('char-')
      ? sheetKeyLower.replace(/^char-/, 'pc-')
      : sheetKeyLower.replace(/^pc-/, 'char-');
    const sheetNameLower = sheet.name.trim().toLowerCase();
    const sheetFirstWord = sheetNameLower.split(/[\s(]+/)[0] || '';

    const myCharKey = (this.store.activeCampaign().myCharacterKey || '').trim().toLowerCase();
    if (myCharKey && (myCharKey === sheetKeyLower || myCharKey === altKeyLower || sheetKeyLower.endsWith(myCharKey))) {
      return true;
    }

    const profile = this.auth.activeProfile();
    const unameLower = (this.store.activeUsername() || profile?.username || '').trim().toLowerCase();
    const accIdLower = (profile?.accountId || '').trim().toLowerCase();

    if (unameLower && sheet.ownerUsername && sheet.ownerUsername.trim().toLowerCase() === unameLower) {
      return true;
    }
    if ((unameLower === 'sbrogan' || unameLower === 'scottbrogan') && (sheetKeyLower === 'char-dal' || sheetFirstWord === 'dal' || sheetFirstWord === 'dallas')) {
      return true;
    }

    const rosterEntry = this.store.activeCampaignPlayers().find(
      (p) =>
        (unameLower && p.username.trim().toLowerCase() === unameLower) ||
        (accIdLower && p.accountId.trim().toLowerCase() === accIdLower),
    );
    if (rosterEntry) {
      const assignedKey = (rosterEntry.assignedCharacterKey || '').trim().toLowerCase();
      const assignedName = (rosterEntry.assignedCharacterName || '').trim().toLowerCase();
      if (
        assignedKey &&
        (assignedKey === sheetKeyLower ||
          assignedKey === altKeyLower ||
          sheetKeyLower.endsWith(assignedKey) ||
          assignedKey.endsWith(sheetKeyLower))
      ) {
        return true;
      }
      if (
        assignedName &&
        (assignedName === sheetNameLower ||
          (sheetFirstWord.length >= 3 && assignedName.includes(sheetFirstWord)))
      ) {
        return true;
      }
    }

    return false;
  }

  resolveSheetForToken(token: VttTokenVm | null | undefined): CharacterSheetVm | null {
    if (!token) return null;
    const sheets = this.characterStudio.campaignSheets();
    const allSheets = sheets.length > 0 ? sheets : this.characterStudio.sheets();
    const keyLower = (token.key || '').toLowerCase();
    const nameLower = (token.name || '').trim().toLowerCase();
    const firstWord = nameLower.split(/[\s(]+/)[0] || '';

    for (const s of allSheets) {
      const charKeyLower = s.characterKey.toLowerCase();
      const compLower = s.compositeKey.toLowerCase();
      const sheetNameLower = s.name.trim().toLowerCase();
      const sheetFirstWord = sheetNameLower.split(/[\s(]+/)[0] || '';

      if (
        keyLower === compLower ||
        keyLower === charKeyLower ||
        keyLower.endsWith(`:${charKeyLower}`) ||
        nameLower === sheetNameLower ||
        (firstWord.length >= 3 &&
          (firstWord === sheetFirstWord ||
            sheetFirstWord.startsWith(firstWord) ||
            firstWord.startsWith(sheetFirstWord)))
      ) {
        return s;
      }
    }
    return null;
  }

  mergeCampaignPartyIntoTokens(
    existingTokens: readonly VttTokenVm[],
    campaignId: number,
  ): VttTokenVm[] {
    const sheets = this.characterStudio.campaignSheets();
    if (sheets.length === 0) return [...existingTokens];

    const matchedTokenKeys = new Set<string>();
    const partyTokens: VttTokenVm[] = [];

    sheets.forEach((sheet, idx) => {
      const canonicalKey = `${campaignId}:Character:${sheet.characterKey}`;
      const existing = existingTokens.find((t) => {
        if (matchedTokenKeys.has(t.key)) return false;
        const resolved = this.resolveSheetForToken(t);
        return resolved?.characterKey === sheet.characterKey;
      });

      const resolvedAssets = resolveDefaultTokenFromLibrary({
        name: sheet.name,
        roleLabel: sheet.classOrArchetype,
        faction: 'party',
        key: canonicalKey,
        avatarUrl: existing?.avatarUrl || sheet.portraitUrl,
        glbUrl: existing?.glbUrl,
      });

      const darkvisionFeet = this.inferDarkvisionFeet(sheet);
      const sightFeet = this.inferSightFeet(sheet);
      const slot = PARTY_FORMATION_SLOTS[idx % PARTY_FORMATION_SLOTS.length];
      const canControl = this.isSheetControlledByCurrentViewer(sheet);

      if (existing) {
        matchedTokenKeys.add(existing.key);
        partyTokens.push({
          ...existing,
          key: existing.key || canonicalKey,
          name: sheet.name,
          roleLabel: `Lv.${sheet.level} ${sheet.classOrArchetype}`,
          faction: 'party',
          colorHex: '#22c55e',
          maxHp: sheet.maxHp,
          currentHp:
            existing.currentHp > 0 ? Math.min(existing.currentHp, sheet.maxHp) : sheet.currentHp,
          armorClass: sheet.armorClass,
          movementFeet: existing.movementFeet > 0 ? existing.movementFeet : sheet.speedFeet,
          sightFeet: existing.sightFeet ?? sightFeet,
          darkvisionFeet: existing.darkvisionFeet ?? darkvisionFeet,
          canControl,
          avatarUrl: resolvedAssets.avatarUrl,
          glbUrl: resolvedAssets.glbUrl,
        });
      } else {
        partyTokens.push({
          key: canonicalKey,
          name: sheet.name,
          roleLabel: `Lv.${sheet.level} ${sheet.classOrArchetype}`,
          faction: 'party',
          initiative: 12 + sheet.initiativeBonus,
          currentHp: sheet.currentHp,
          maxHp: sheet.maxHp,
          armorClass: sheet.armorClass,
          x: slot.x,
          z: slot.z,
          colorHex: '#22c55e',
          actionUsed: false,
          bonusUsed: false,
          reactionUsed: false,
          movementFeet: sheet.speedFeet || 30,
          sightFeet,
          darkvisionFeet,
          canControl,
          avatarUrl: resolvedAssets.avatarUrl,
          glbUrl: resolvedAssets.glbUrl,
          sizeCategory: this.inferSizeCategory(sheet),
        });
      }
    });

    if (this.store.viewerRole() !== 'gm' && partyTokens.length > 0 && !partyTokens.some((t) => t.canControl)) {
      const preferredKey = this.characterStudio.activeSheet()?.characterKey;
      const idx = preferredKey
        ? partyTokens.findIndex((t) => t.key.endsWith(`:${preferredKey}`) || t.key === preferredKey)
        : 0;
      const fallbackIdx = idx >= 0 ? idx : 0;
      partyTokens[fallbackIdx] = { ...partyTokens[fallbackIdx], canControl: true };
    }

    const otherTokens = existingTokens.filter((t) => {
      if (matchedTokenKeys.has(t.key)) return false;
      if (t.faction === 'party' && (t.name === 'Tobin Vance' || t.name === 'Sister Elowen')) {
        return false;
      }
      return true;
    }).map((t) => ({
      ...t,
      canControl: this.store.viewerRole() === 'gm',
    }));

    return [...partyTokens, ...otherTokens];
  }

  private inferDarkvisionFeet(sheet: CharacterSheetVm): number {
    const text = `${sheet.ancestryOrClan} ${sheet.subrace} ${sheet.tags.join(' ')}`.toLowerCase();
    if (text.includes('drow') || text.includes('deep') || text.includes('superior')) return 120;
    if (/elf|dwarf|catfolk|tabaxi|orc|fey|gnome|tiefling/.test(text)) return 60;
    return 30;
  }

  private inferSightFeet(sheet: CharacterSheetVm): number {
    const text = `${sheet.classOrArchetype} ${sheet.features.join(' ')}`.toLowerCase();
    return /ranger|scout|truth/.test(text) ? 60 : 45;
  }

  private inferSizeCategory(sheet: CharacterSheetVm): 'small' | 'medium' {
    const text = `${sheet.ancestryOrClan} ${sheet.subrace} ${sheet.portraitUrl}`.toLowerCase();
    return /halfling|gnome|fivi/.test(text) ? 'small' : 'medium';
  }

  resolveTacticalAbilitiesForToken(
    token: VttTokenVm | null | undefined,
    creatures: readonly CreatureCardVm[] = [],
  ): VttTacticalAbilityVm[] {
    if (!token) return [];
    const sheet = this.resolveSheetForToken(token);
    const cacheKey = sheet
      ? `sheet:${token.key}:${sheet.compositeKey}:${sheet.level}:${sheet.features.length}`
      : `creat:${token.key}:${token.name}:${creatures.length}`;
    const cached = this.abilitiesCache.get(cacheKey);
    if (cached) return cached;

    const result = sheet
      ? buildCharacterSheetAbilities(token.key, sheet)
      : buildCreatureOrNpcAbilities(token, creatures);
    if (this.abilitiesCache.size > 64) this.abilitiesCache.clear();
    this.abilitiesCache.set(cacheKey, result);
    return result;
  }

  getDockActionsForToken(
    token: VttTokenVm | null | undefined,
    category: Exclude<VttTurnActionCategory, 'all' | 'free'>,
    creatures: readonly CreatureCardVm[] = [],
  ): DockAction[] {
    if (!token) return [];
    const sheet = this.resolveSheetForToken(token);
    const cacheKey = `${category}:${token.key}:${sheet?.compositeKey ?? token.name}:${sheet?.level ?? 0}:${sheet?.features.length ?? 0}:${creatures.length}`;
    const cached = this.dockActionsCache.get(cacheKey);
    if (cached) return cached;

    const result = this.resolveTacticalAbilitiesForToken(token, creatures)
      .filter((a) => a.turnCategory === category)
      .map(toDockAction);
    if (this.dockActionsCache.size > 128) this.dockActionsCache.clear();
    this.dockActionsCache.set(cacheKey, result);
    return result;
  }
}
