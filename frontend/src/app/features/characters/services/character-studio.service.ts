import { syncCatalogInventory } from './catalog-inventory-sync';
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AdventureGuideService } from '../../../core/services/adventure-guide.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import {
  AbilityScoreVm, CharacterCreatorDraftVm, CharacterRichNoteVm, CharacterSheetTab,
  CharacterSheetVm, CharacterSpellVm, CharacterStudioViewMode, EquipmentLoadoutItemVm,
} from '../models/character-studio.models';
import { buildSeedPartySheets, wizardDefaultEquipment } from '../models/character-studio-seed.data';
import { CharacterCompendiumCatalogService } from './character-compendium-catalog.service';
import {
  PlayerAssignmentRecord, buildDraftFromExistingSheet, buildFinalizedCharacterSheet,
  recalculateCharacterSheet, rollSixStatSet,
} from './character-studio-calc.helpers';

const CUSTOM_SHEETS_STORAGE_KEY = 'lw_custom_character_sheets_v2';
const REMOVED_CHARACTERS_STORAGE_KEY = 'lw_removed_campaign_characters_v2';
const PLAYER_ASSIGNMENTS_STORAGE_KEY = 'lw_character_player_assignments_v2';

@Injectable({ providedIn: 'root' })
export class CharacterStudioService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly adventureGuide = inject(AdventureGuideService);
  private readonly auth = inject(AuthSessionService);
  private readonly alertify = inject(LwAlertifyService);
  readonly catalog = inject(CharacterCompendiumCatalogService);

  readonly activeSystem = signal<'dnd5e' | 'pf2e' | 'vampire_v5'>('dnd5e');
  readonly selectedCharacterKey = signal<string>('char-dal');
  readonly removedCharacterKeys = signal<readonly string[]>([]);
  readonly playerAssignments = signal<Readonly<Record<string, PlayerAssignmentRecord>>>({});
  readonly sheets = signal<readonly CharacterSheetVm[]>(
    buildSeedPartySheets().map((s) => this.recalculate(s, 'dnd5e')),
  );

  readonly viewMode = signal<CharacterStudioViewMode>('viewer');
  readonly activeSheetTab = signal<CharacterSheetTab>('overview');
  readonly creatorStep = signal<number>(1);
  readonly isEditingCharacter = signal<boolean>(false);
  private readonly editingCharacterKey = signal<string | null>(null);
  readonly ancestrySourceFilter = signal<'All' | 'PHB' | 'SRD 5.1' | 'Homebrew'>('All');
  readonly ancestrySearchQuery = signal<string>('');

  readonly creatorDraft = signal<CharacterCreatorDraftVm>({
    name: 'Aldric Vale', pronouns: 'He/Him', alignment: 'Neutral Good',
    quote: '"Knowledge preserves what time would otherwise forget."',
    portraitUrl: '/assets/5e-tools/races/PHB/Elf.webp', level: 1,
    ancestryId: 'elf', subraceId: 'high-elf', classId: 'wizard', subclass: 'School of Evocation',
    backgroundId: 'sage', selectedSkills: ['Arcana', 'History', 'Investigation', 'Perception'],
    selectedFeatId: 'Warcaster', startingPack: 'Starting Equipment',
    equipmentItems: wizardDefaultEquipment('ciaran'),
    equippedItemIds: ['ciaran-focus', 'ciaran-spellbook', 'ciaran-robes', 'ciaran-belt'],
    backpackItemIds: ['ciaran-ring', 'ciaran-pack'],
    personalityTrait: 'Methodical, curious, and always cross-referencing inscriptions.',
    ideal: 'Truth should be recorded, not buried beneath politics.',
    bond: 'An ancient manuscript with missing pages that points to forgotten history.',
    flaw: 'Will risk danger to read an unsealed rune or inscription.',
    abilities: { STR: 8, DEX: 14, CON: 14, INT: 15, WIS: 12, CHA: 10 },
  });

  readonly campaignSheets = computed<readonly CharacterSheetVm[]>(() => {
    const campaignId = this.store.activeCampaignId() || 1;
    const removed = new Set(this.removedCharacterKeys());
    const assigns = this.playerAssignments();
    return this.sheets()
      .filter((s) => (s.campaignId === campaignId || s.campaignId === 1) && !removed.has(s.characterKey) && !removed.has(`${campaignId}:${s.characterKey}`))
      .map((s) => {
        const override = assigns[s.characterKey];
        return {
          ...s,
          campaignId,
          compositeKey: `${campaignId}:Character:${s.characterKey}`,
          ownerAccountId: override ? override.ownerAccountId : s.ownerAccountId,
          ownerUsername: override ? override.ownerUsername : s.ownerUsername,
          ownerDisplayName: override ? override.ownerDisplayName : (s.ownerDisplayName || s.ownerUsername || 'Unassigned'),
        };
      });
  });

  readonly userOwnedSheets = computed<readonly CharacterSheetVm[]>(() => {
    const profile = this.auth.activeProfile();
    if (!profile || profile.accountId === 'unauthenticated') return [];
    const bound = (profile.boundCharacter || '').trim().toLowerCase();
    return this.campaignSheets().filter((s) => {
      if (s.ownerAccountId === profile.accountId) return true;
      if (s.ownerUsername && s.ownerUsername.toLowerCase() === (profile.username || '').toLowerCase()) return true;
      return bound && bound !== 'gm' && bound !== 'none'
        ? s.name.toLowerCase().includes(bound) || s.characterKey.toLowerCase().includes(bound)
        : false;
    });
  });

  readonly maxCharactersForAccount = computed<number>(() => this.auth.activeProfile().tierCode === 'free' ? 2 : 10);
  readonly userCharacterCount = computed<number>(() => Math.max(1, this.userOwnedSheets().length));
  readonly canCreateMoreCharacters = computed<boolean>(() => this.userOwnedSheets().length < this.maxCharactersForAccount());
  readonly accountTierLimitLabel = computed<string>(() => {
    const max = this.maxCharactersForAccount();
    const cur = Math.min(max, this.userOwnedSheets().length);
    return `${cur} / ${max} Characters (${this.auth.activeProfile().tierCode === 'free' ? 'Free Limit: 2' : 'Max: 10'})`;
  });
  readonly hasUserCharacters = computed<boolean>(() => this.userOwnedSheets().length > 0);

  readonly authorizedSheetsForActiveCampaign = computed<readonly CharacterSheetVm[]>(() => {
    const allInCampaign = this.campaignSheets();
    if (allInCampaign.length === 0) return [];
    if (this.store.isGmForActiveCampaign() && this.store.viewerRole() === 'gm') return allInCampaign;
    const owned = this.userOwnedSheets();
    return owned.length > 0 ? owned : [allInCampaign[0]];
  });

  readonly activeSheet = computed<CharacterSheetVm | null>(() => {
    const authorized = this.authorizedSheetsForActiveCampaign();
    const found = authorized.find((s) => s.characterKey === this.selectedCharacterKey()) ?? authorized[0];
    return found ? this.recalculate(found, this.activeSystem()) : null;
  });

  private lastInitializedAccountId = '';

  mergeCatalogInventory(_campaignId: number, characterKey: string, equipment: readonly EquipmentLoadoutItemVm[]): void {
    this.sheets.update((sheets) => sheets.map((sheet) => {
      if (sheet.characterKey !== characterKey) return sheet;
      const ids = new Set(equipment.map((e) => e.id));
      return this.recalculate({ ...sheet, equipment: [...equipment, ...sheet.equipment.filter((e) => !ids.has(e.id))] }, sheet.systemCode);
    }));
  }

  constructor() {
    this.restoreLocalCharacterPersistence();
    syncCatalogInventory(this.http, this.store, this.auth, () => this.sheets.update((rows) => rows.map((s) => ({ ...s, equipment: s.equipment.filter((e) => !e.id.startsWith('inv-')) }))), (campaign, key, items) => this.mergeCatalogInventory(campaign, key, items));
    effect(() => {
      const profile = this.auth.activeProfile();
      const authorized = this.authorizedSheetsForActiveCampaign();
      const owned = this.userOwnedSheets();
      if (profile.accountId !== this.lastInitializedAccountId) {
        this.lastInitializedAccountId = profile.accountId;
        this.selectedCharacterKey.set(owned[0]?.characterKey ?? authorized[0]?.characterKey ?? 'char-dal');
        this.viewMode.set('viewer');
      } else if (authorized.length > 0 && !authorized.some((s) => s.characterKey === this.selectedCharacterKey())) {
        this.selectedCharacterKey.set(authorized[0].characterKey);
      }
    }, { allowSignalWrites: true });
  }

  private restoreLocalCharacterPersistence(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const removedRaw = localStorage.getItem(REMOVED_CHARACTERS_STORAGE_KEY);
      if (removedRaw) this.removedCharacterKeys.set(JSON.parse(removedRaw));
      const assignsRaw = localStorage.getItem(PLAYER_ASSIGNMENTS_STORAGE_KEY);
      if (assignsRaw) this.playerAssignments.set(JSON.parse(assignsRaw));
      const customRaw = localStorage.getItem(CUSTOM_SHEETS_STORAGE_KEY);
      if (customRaw) {
        const customSheets: readonly CharacterSheetVm[] = JSON.parse(customRaw);
        if (Array.isArray(customSheets) && customSheets.length > 0) {
          this.sheets.update((cur) => {
            const customKeys = new Set(customSheets.map((c) => c.characterKey));
            return [...customSheets.map((c) => this.recalculate(c, 'dnd5e')), ...cur.filter((s) => !customKeys.has(s.characterKey))];
          });
        }
      }
    } catch {}
  }

  private saveCustomSheetToStorage(sheet: CharacterSheetVm): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(CUSTOM_SHEETS_STORAGE_KEY);
      const existing: CharacterSheetVm[] = raw ? JSON.parse(raw) : [];
      localStorage.setItem(CUSTOM_SHEETS_STORAGE_KEY, JSON.stringify([sheet, ...existing.filter((s) => s.characterKey !== sheet.characterKey)]));
    } catch {}
  }

  syncDefaultViewForSignedInUser(requestedMode?: string | null, focusKey?: string | null): void {
    const authorized = this.authorizedSheetsForActiveCampaign();
    if (focusKey) {
      const exists = authorized.find((s) => s.characterKey === focusKey) ?? this.campaignSheets().find((s) => s.characterKey === focusKey);
      if (exists) this.selectedCharacterKey.set(exists.characterKey);
    }
    if (requestedMode === 'creator' || requestedMode === 'create') {
      this.startNewCharacterCreation();
      return;
    }
    const owned = this.userOwnedSheets();
    if (!focusKey || !authorized.some((s) => s.characterKey === this.selectedCharacterKey())) {
      this.selectedCharacterKey.set(owned[0]?.characterKey ?? authorized[0]?.characterKey ?? 'char-dal');
    }
    this.viewMode.set('viewer');
  }

  selectCharacter(characterKey: string, openViewer = false): void {
    const allowed = this.authorizedSheetsForActiveCampaign().find((s) => s.characterKey === characterKey);
    if (!allowed) return;
    this.selectedCharacterKey.set(allowed.characterKey);
    this.store.inspectEntity(`${allowed.campaignId}:Character:${allowed.characterKey}`);
    if (openViewer) this.viewMode.set('viewer');
  }

  startNewCharacterCreation(assignToPlayer?: { accountId: string; username: string; displayName: string }): boolean {
    if (!this.store.isGmForActiveCampaign() && !this.canCreateMoreCharacters()) {
      const max = this.maxCharactersForAccount();
      const tier = this.auth.activeProfile().tierCode;
      this.alertify.notifyStatus(
        this.auth.activeProfile().displayName || 'Player',
        'Character Limit Reached',
        tier === 'free'
          ? `Free accounts can have a maximum of ${max} characters. Upgrade your account tier to create up to 10 characters.`
          : `You have reached the maximum of ${max} characters for your account.`,
        'crimson',
      );
      return false;
    }
    this.openCreatorWizard(undefined, assignToPlayer);
    return true;
  }

  openCreatorWizard(fromExisting?: CharacterSheetVm, assignToPlayer?: { accountId: string; username: string; displayName: string }): void {
    if (fromExisting) {
      this.isEditingCharacter.set(true);
      this.editingCharacterKey.set(fromExisting.characterKey);
      this.creatorDraft.set(buildDraftFromExistingSheet(fromExisting, this.catalog.ancestries(), this.catalog.classes(), this.catalog.backgrounds()));
    } else {
      const profile = this.auth.activeProfile();
      this.isEditingCharacter.set(false);
      this.editingCharacterKey.set(null);
      this.creatorStep.set(1);
      this.creatorDraft.update((cur) => ({
        ...cur, name: 'New Adventurer', level: 1, equipmentItems: wizardDefaultEquipment('new'),
        abilities: { STR: 8, DEX: 14, CON: 14, INT: 15, WIS: 12, CHA: 10 },
        assignedPlayerAccountId: assignToPlayer?.accountId ?? profile.accountId,
        assignedPlayerUsername: assignToPlayer?.username ?? profile.username,
        assignedPlayerDisplayName: assignToPlayer?.displayName ?? profile.displayName,
        abilityRollSet1: undefined, abilityRollSet2: undefined, activeRollSetIndex: undefined, rerollUsed: false,
      }));
    }
    this.viewMode.set('creator');
  }

  rollCreatorAbilityStatSet(): void {
    const cur = this.creatorDraft();
    if (!cur.abilityRollSet1) {
      const set1 = rollSixStatSet();
      this.creatorDraft.update((d) => ({ ...d, abilityRollSet1: set1, activeRollSetIndex: 1, rerollUsed: false, abilities: { STR: set1[0], DEX: set1[1], CON: set1[2], INT: set1[3], WIS: set1[4], CHA: set1[5] } }));
      return;
    }
    if (!cur.rerollUsed) {
      const set2 = rollSixStatSet();
      this.creatorDraft.update((d) => ({ ...d, abilityRollSet2: set2, activeRollSetIndex: 2, rerollUsed: true, abilities: { STR: set2[0], DEX: set2[1], CON: set2[2], INT: set2[3], WIS: set2[4], CHA: set2[5] } }));
    }
  }

  selectKeptAbilityRollSet(setIndex: 1 | 2): void {
    const cur = this.creatorDraft();
    const chosen = setIndex === 2 && cur.abilityRollSet2 ? cur.abilityRollSet2 : cur.abilityRollSet1;
    if (!chosen) return;
    this.creatorDraft.update((d) => ({ ...d, activeRollSetIndex: setIndex, abilities: { STR: chosen[0], DEX: chosen[1], CON: chosen[2], INT: chosen[3], WIS: chosen[4], CHA: chosen[5] } }));
  }

  swapCreatorRolledAbilities(codeA: AbilityScoreVm['code'], codeB: AbilityScoreVm['code']): void {
    if (codeA === codeB) return;
    this.creatorDraft.update((cur) => ({ ...cur, abilities: { ...cur.abilities, [codeA]: cur.abilities[codeB], [codeB]: cur.abilities[codeA] } }));
  }

  assignCharacterToPlayer(characterKey: string, playerAccountId: string, playerUsername: string, playerDisplayName: string): void {
    const cid = this.store.activeCampaignId() || 1;
    this.playerAssignments.update((cur) => {
      const next = { ...cur, [characterKey]: { ownerAccountId: playerAccountId, ownerUsername: playerUsername, ownerDisplayName: playerDisplayName } };
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(PLAYER_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    this.sheets.update((list) => list.map((s) => s.characterKey === characterKey ? { ...s, ownerAccountId: playerAccountId, ownerUsername: playerUsername, ownerDisplayName: playerDisplayName } : s));
    this.store.assignPlayerCharacterInRoster(characterKey, playerAccountId, playerUsername);
    if (cid > 0) {
      this.http.post(`/api/v2/campaigns/${cid}/members/assign-character`, { characterKey, playerAccountId, playerUsername, playerEmail: `${playerUsername.toLowerCase()}@loom-weaver.com` }).subscribe({ error: () => {} });
    }
    this.alertify.notifyStatus(
      'Campaign Roster',
      'Character Assignment Updated',
      playerUsername ? `Assigned character to ${playerDisplayName} (@${playerUsername}).` : 'Unassigned character to GM Pool.',
      'emerald',
    );
  }

  removeCharacterFromCampaign(characterKey: string): void {
    const cid = this.store.activeCampaignId() || 1;
    const sheet = this.campaignSheets().find((s) => s.characterKey === characterKey);
    this.removedCharacterKeys.update((cur) => {
      const next = Array.from(new Set([...cur, characterKey, `${cid}:${characterKey}`]));
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(REMOVED_CHARACTERS_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    this.store.assignPlayerCharacterInRoster(characterKey, '', '');
    if (cid > 0) this.http.delete(`/api/v2/campaigns/${cid}/characters/${encodeURIComponent(characterKey)}`).subscribe({ error: () => {} });
    const remaining = this.authorizedSheetsForActiveCampaign();
    if (this.selectedCharacterKey() === characterKey && remaining.length > 0) this.selectedCharacterKey.set(remaining[0].characterKey);
    this.alertify.notifyStatus('Campaign Roster', 'Character Removed', `${sheet?.name || characterKey} was removed from ${this.store.activeCampaign().name}.`, 'gold');
  }

  openSheetViewer(characterKey?: string): void { if (characterKey) this.selectedCharacterKey.set(characterKey); this.viewMode.set('viewer'); }
  openStudioRoster(): void { this.viewMode.set('viewer'); }
  updateCreatorDraft(patch: Partial<CharacterCreatorDraftVm>): void { this.creatorDraft.update((cur) => ({ ...cur, ...patch })); }

  updateCreatorAbility(code: AbilityScoreVm['code'], delta: number): void {
    const isEdit = this.isEditingCharacter();
    const minScore = isEdit ? 6 : 8;
    const maxScore = isEdit ? 20 : 18;
    this.creatorDraft.update((cur) => ({ ...cur, abilities: { ...cur.abilities, [code]: Math.max(minScore, Math.min(maxScore, (cur.abilities[code] ?? 10) + delta)) } }));
  }

  toggleCreatorSkill(skillLabel: string): void {
    this.creatorDraft.update((cur) => {
      const exists = cur.selectedSkills.includes(skillLabel);
      return { ...cur, selectedSkills: exists ? cur.selectedSkills.filter((s) => s !== skillLabel) : [...cur.selectedSkills, skillLabel] };
    });
  }

  finalizeWizardCharacter(): CharacterSheetVm {
    const draft = this.creatorDraft();
    const editingKey = this.editingCharacterKey();
    const existingSheet = editingKey ? this.sheets().find((s) => s.characterKey === editingKey) : undefined;
    const profile = this.auth.activeProfile();
    const targetCampaignId = existingSheet?.campaignId ?? (this.store.activeCampaignId() || 1);

    const calculated = buildFinalizedCharacterSheet({
      draft, isEditing: this.isEditingCharacter(), existingSheet, targetCampaignId,
      campaignName: this.store.activeCampaign().name, systemCode: this.activeSystem(),
      defaultOwner: { ownerAccountId: profile.accountId, ownerUsername: profile.username, ownerDisplayName: profile.displayName },
      ancestries: this.catalog.ancestries(), classes: this.catalog.classes(),
      backgrounds: this.catalog.backgrounds(), feats: this.catalog.feats(),
      metEntities: this.catalog.metEntities(), campaignHistory: this.catalog.campaignHistory(),
    });

    const charKey = calculated.characterKey;
    this.removedCharacterKeys.update((cur) => cur.filter((k) => k !== charKey && k !== `${targetCampaignId}:${charKey}`));
    this.sheets.update((prev) => [calculated, ...prev.filter((s) => s.characterKey !== charKey)]);
    this.saveCustomSheetToStorage(calculated);
    this.assignCharacterToPlayer(charKey, calculated.ownerAccountId, calculated.ownerUsername || profile.username, calculated.ownerDisplayName || profile.displayName);
    if (targetCampaignId > 0) {
      this.http.post(`/api/v2/campaigns/${targetCampaignId}/character-studio/create`, {
        name: calculated.name, ancestryOrClan: calculated.ancestryOrClan, classOrArchetype: calculated.classOrArchetype,
        systemCode: calculated.systemCode, level: calculated.level, abilityScores: draft.abilities,
      }).subscribe({ error: () => {} });
    }
    this.selectedCharacterKey.set(charKey);
    this.isEditingCharacter.set(false);
    this.editingCharacterKey.set(null);
    this.viewMode.set('viewer');
    this.activeSheetTab.set('overview');
    this.registerInCampaignStore(calculated);
    return calculated;
  }

  adjustAbility(code: AbilityScoreVm['code'], delta: number): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((sheet) => sheet.characterKey !== key ? sheet : this.recalculate({ ...sheet, abilities: sheet.abilities.map((a) => (a.code === code ? { ...a, score: Math.max(6, Math.min(22, a.score + delta)) } : a)) }, this.activeSystem())));
  }

  toggleEquipment(equipmentId: string): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((sheet) => sheet.characterKey !== key ? sheet : this.recalculate({ ...sheet, equipment: sheet.equipment.map((eq) => (eq.id === equipmentId ? { ...eq, equipped: !eq.equipped } : eq)) }, this.activeSystem())));
  }

  addEquipmentFromDatabase(item: EquipmentLoadoutItemVm, equipNow: boolean): void { this.addEquipmentToCharacter(this.selectedCharacterKey(), item, equipNow); }

  addEquipmentToCharacter(characterKey: string, item: EquipmentLoadoutItemVm, equipNow: boolean): CharacterSheetVm | null {
    const newItem: EquipmentLoadoutItemVm = { ...item, id: `${item.id}-${Date.now().toString(36).slice(-4)}`, equipped: equipNow };
    let updatedSheet: CharacterSheetVm | null = null;
    this.sheets.update((list) => list.map((sheet) => {
      if (sheet.characterKey !== characterKey) return sheet;
      updatedSheet = this.recalculate({ ...sheet, equipment: [newItem, ...sheet.equipment] }, this.activeSystem());
      return updatedSheet;
    }));
    return updatedSheet;
  }

  removeEquipmentItem(equipmentId: string): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((sheet) => (sheet.characterKey === key ? this.recalculate({ ...sheet, equipment: sheet.equipment.filter((e) => e.id !== equipmentId) }, this.activeSystem()) : sheet)));
  }

  toggleSpellPrepared(spellId: string): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((sheet) => sheet.characterKey !== key ? sheet : { ...sheet, spellGroups: sheet.spellGroups.map((grp) => ({ ...grp, spells: grp.spells.map((sp) => (sp.id === spellId ? { ...sp, prepared: grp.isCantrip ? true : !sp.prepared } : sp)) })) }));
  }

  addSpellToActiveCharacter(spell: CharacterSpellVm, prepared: boolean): void {
    const key = this.selectedCharacterKey();
    const isCantrip = (spell.level ?? 1) === 0;
    const groupId = isCantrip ? 'cantrips' : `level-${spell.level ?? 1}`;
    const groupLabel = isCantrip ? 'Cantrips (Always Prepared)' : `Level ${spell.level ?? 1} Spells`;
    this.sheets.update((list) => list.map((sheet) => {
      if (sheet.characterKey !== key) return sheet;
      const existsGrp = sheet.spellGroups.some((g) => g.groupId === groupId);
      const spellEntry: CharacterSpellVm = { ...spell, prepared: isCantrip ? true : prepared };
      const spellGroups = existsGrp
        ? sheet.spellGroups.map((g) => (g.groupId === groupId && !g.spells.some((s) => s.name === spell.name) ? { ...g, spells: [...g.spells, spellEntry] } : g))
        : [...sheet.spellGroups, { groupId, label: groupLabel, slotsRemaining: 2, slotsMax: 2, isCantrip, spells: [spellEntry] }];
      return { ...sheet, spellGroups };
    }));
  }

  unlockEquipment(equipmentId: string): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((sheet) => sheet.characterKey !== key ? sheet : this.recalculate({ ...sheet, equipment: sheet.equipment.map((eq) => (eq.id === equipmentId ? { ...eq, entitlement: 'purchased' as const, equipped: true } : eq)) }, this.activeSystem())));
  }

  setActiveCharacterPortrait(portraitUrl: string): void {
    if (!portraitUrl) return;
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((sheet) => (sheet.characterKey === key ? { ...sheet, portraitUrl } : sheet)));
  }

  cyclePortrait(): void { this.setActiveCharacterPortrait('/assets/5e-tools/races/PHB/Elf.webp'); }

  executeLevelUp(featureName: string, abilityBoost: AbilityScoreVm['code']): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((sheet) => {
      if (sheet.characterKey !== key) return sheet;
      const nextLevel = sheet.level + 1;
      const abilities = sheet.abilities.map((a) => (a.code === abilityBoost ? { ...a, score: Math.min(22, a.score + 1) } : a));
      const features = [...sheet.features, `Lv.${nextLevel}: ${featureName}`];
      const featureCards = [...sheet.featureCards, { id: `feat-lv-${nextLevel}`, title: `Lv.${nextLevel} · ${featureName} (+1 ${abilityBoost})`, category: 'feat' as const, summary: `Unlocked at Level ${nextLevel} along with +1 ${abilityBoost}.`, icon: 'zap', tone: 'gold' as const }];
      const historyEvents = [`Advanced to Level ${nextLevel}: selected ${featureName} and +1 ${abilityBoost}.`, ...sheet.historyEvents];
      return this.recalculate({ ...sheet, level: nextLevel, nextLevelXp: sheet.nextLevelXp + 14000, abilities, features, featureCards, historyEvents }, this.activeSystem());
    }));
  }

  addCharacterNote(text: string): void {
    const clean = text.trim();
    if (!clean) return;
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((s) => (s.characterKey === key ? { ...s, notes: [clean, ...s.notes] } : s)));
  }

  addRichCharacterNote(note: CharacterRichNoteVm): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((s) => s.characterKey === key ? { ...s, richNotes: [note, ...(s.richNotes ?? [])], notes: [`[${note.visibility.toUpperCase()}] ${note.title}: ${note.contentText}`, ...s.notes] } : s));
    this.catalog.syncNoteToLoom(this.store.activeCampaignId(), note);
  }

  createCharacter(name: string, ancestry: string, archetype: string): void {
    this.updateCreatorDraft({ name: name.trim() || 'New Character', subclass: archetype });
    const created = this.finalizeWizardCharacter();
    this.sheets.update((list) => list.map((s) => (s.characterKey === created.characterKey ? this.recalculate({ ...s, ancestryOrClan: ancestry, classOrArchetype: archetype, level: 7 }, this.activeSystem()) : s)));
  }

  private registerInCampaignStore(sheet: CharacterSheetVm): void {
    this.store.registerEntity({
      compositeKey: sheet.compositeKey, entityKey: sheet.characterKey, campaignId: sheet.campaignId,
      entityType: 'Character', name: sheet.name, subtitle: `${sheet.ancestryOrClan} · ${sheet.classOrArchetype}`,
      visibility: 'players', canonStatus: 'approved',
      summary: `Level ${sheet.level} ${sheet.ancestryOrClan} ${sheet.classOrArchetype} (HP ${sheet.maxHp}, AC ${sheet.armorClass}).`,
      routeLink: `/characters?focus=${sheet.characterKey}`,
    });
    this.adventureGuide.populateCharacterOrNpc({
      compositeKey: sheet.compositeKey, name: sheet.name, role: `${sheet.ancestryOrClan} · ${sheet.classOrArchetype}`,
      dispositionLabel: 'Party Hero', motive: `Active party member (Lv.${sheet.level}, HP ${sheet.maxHp}, AC ${sheet.armorClass}).`,
      artworkUrl: sheet.portraitUrl, sessionId: 'session-15', locationNodeId: 'node-room-c1-nave',
      routeLink: `/characters?focus=${sheet.characterKey}`,
    });
  }

  private recalculate(sheet: CharacterSheetVm, systemCode: 'dnd5e' | 'pf2e' | 'vampire_v5'): CharacterSheetVm {
    return recalculateCharacterSheet(sheet, systemCode, this.catalog.metEntities(), this.catalog.campaignHistory());
  }
}
