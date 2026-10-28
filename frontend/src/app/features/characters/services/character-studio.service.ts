import { syncCatalogInventory } from './catalog-inventory-sync';
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AdventureGuideService } from '../../../core/services/adventure-guide.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { buildSavingThrows, buildSkillsList } from '../models/character-creator-catalog.data';
import {
  AbilityScoreVm,
  CharacterCreatorDraftVm,
  CharacterRichNoteVm,
  CharacterSheetTab,
  CharacterSheetVm,
  CharacterSpellVm,
  CharacterStudioViewMode,
  EquipmentLoadoutItemVm,
} from '../models/character-studio.models';
import { DEFAULT_CONNECTIONS, buildSeedPartySheets, wizardDefaultEquipment } from '../models/character-studio-seed.data';
import { CharacterCompendiumCatalogService } from './character-compendium-catalog.service';

@Injectable({ providedIn: 'root' })
export class CharacterStudioService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly adventureGuide = inject(AdventureGuideService);
  private readonly auth = inject(AuthSessionService);
  readonly catalog = inject(CharacterCompendiumCatalogService);

  readonly activeSystem = signal<'dnd5e' | 'pf2e' | 'vampire_v5'>('dnd5e');
  readonly selectedCharacterKey = signal<string>('char-ciaran');
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
    name: 'Ciarán Fiachra', pronouns: 'He/Him', alignment: 'Neutral Good',
    quote: '"Knowledge preserves what time would otherwise forget."',
    portraitUrl: '/assets/5e-tools/races/PHB/Elf.webp', level: 1,
    ancestryId: 'elf', subraceId: 'high-elf', classId: 'wizard', subclass: 'School of Evocation',
    backgroundId: 'sage', selectedSkills: ['Arcana', 'History', 'Investigation', 'Perception'],
    selectedFeatId: 'Warcaster', startingPack: 'Starting Equipment',
    equipmentItems: wizardDefaultEquipment('ciaran'),
    equippedItemIds: ['ciaran-focus', 'ciaran-spellbook', 'ciaran-robe', 'ciaran-belt'],
    backpackItemIds: ['ciaran-ring', 'ciaran-pack'],
    personalityTrait: 'Methodical, curious, and always cross-referencing inscriptions.',
    ideal: 'Truth should be recorded, not buried beneath politics.',
    bond: 'An ancient manuscript with missing pages that points to forgotten history.',
    flaw: 'Will risk danger to read an unsealed rune or inscription.',
    abilities: { STR: 8, DEX: 14, CON: 14, INT: 15, WIS: 12, CHA: 10 },
  });

  readonly userOwnedSheets = computed<readonly CharacterSheetVm[]>(() => {
    const profile = this.auth.activeProfile();
    if (!profile || profile.accountId === 'unauthenticated') return [];
    const bound = (profile.boundCharacter || '').trim().toLowerCase();
    return this.sheets().filter((s) => {
      if (s.ownerAccountId === profile.accountId) return true;
      if (s.ownerUsername && s.ownerUsername.toLowerCase() === (profile.username || '').toLowerCase()) return true;
      return bound && bound !== 'gm' && bound !== 'none'
        ? s.name.toLowerCase().includes(bound) || s.characterKey.toLowerCase().includes(bound)
        : false;
    });
  });

  readonly hasUserCharacters = computed<boolean>(() => this.userOwnedSheets().length > 0);

  /**
   * Per-Campaign GM vs. Player Character Sheet Isolation:
   * - If the signed-in user is the DM/GM of the active campaign AND in GM View, they can view all character sheets in the campaign.
   * - If the signed-in user is a Player in the active campaign (or previewing Player View), they can ONLY view their own character sheet for the selected campaign.
   */
  readonly authorizedSheetsForActiveCampaign = computed<readonly CharacterSheetVm[]>(() => {
    const campaignId = this.store.activeCampaignId();
    const isEffectiveCampaignGm = this.store.isGmForActiveCampaign() && this.store.viewerRole() === 'gm';
    const all = this.sheets();
    if (isEffectiveCampaignGm) {
      const inCamp = all.filter((s) => s.campaignId === campaignId || s.campaignId === 1);
      return inCamp.length > 0 ? inCamp : all;
    }
    const owned = this.userOwnedSheets();
    const campaignSpecificOwned = owned.find((s) => s.campaignId === campaignId);
    const chosen = campaignSpecificOwned ?? owned[0] ?? all[0];
    return chosen ? [chosen] : [];
  });

  readonly activeSheet = computed<CharacterSheetVm>(() => {
    const authorized = this.authorizedSheetsForActiveCampaign();
    const found = authorized.find((s) => s.characterKey === this.selectedCharacterKey()) ?? authorized[0] ?? this.sheets()[0];
    return this.recalculate(found, this.activeSystem());
  });

  private lastInitializedAccountId = '';

  mergeCatalogInventory(campaignId: number, characterKey: string, equipment: readonly EquipmentLoadoutItemVm[]): void {
    this.sheets.update(sheets => sheets.map(sheet => {
      if (sheet.campaignId !== campaignId || sheet.characterKey !== characterKey) return sheet;
      const ids = new Set(equipment.map(e => e.id));
      return this.recalculate({ ...sheet, equipment: [...equipment, ...sheet.equipment.filter(e => !ids.has(e.id))] }, sheet.systemCode);
    }));
  }

  constructor() {
    syncCatalogInventory(this.http, this.store, this.auth, () => this.sheets.update(rows => rows.map(s => ({ ...s, equipment: s.equipment.filter(e => !e.id.startsWith('inv-')) }))), (campaign, key, items) => this.mergeCatalogInventory(campaign, key, items));
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

  syncDefaultViewForSignedInUser(requestedMode?: string | null, focusKey?: string | null): void {
    const authorized = this.authorizedSheetsForActiveCampaign();
    if (focusKey) {
      const exists = authorized.find((s) => s.characterKey === focusKey);
      if (exists) this.selectedCharacterKey.set(exists.characterKey);
    }
    if (requestedMode === 'creator' || requestedMode === 'create') {
      this.openCreatorWizard();
      return;
    }
    const owned = this.userOwnedSheets();
    if (!focusKey || !authorized.some((s) => s.characterKey === this.selectedCharacterKey())) {
      this.selectedCharacterKey.set(owned[0]?.characterKey ?? authorized[0]?.characterKey ?? 'char-dal');
    }
    this.viewMode.set('viewer');
  }

  selectCharacter(characterKey: string, openViewer = false): void {
    const authorized = this.authorizedSheetsForActiveCampaign();
    const allowed = authorized.find((s) => s.characterKey === characterKey);
    if (!allowed) return;
    this.selectedCharacterKey.set(allowed.characterKey);
    this.store.inspectEntity(`${allowed.campaignId}:Character:${allowed.characterKey}`);
    if (openViewer) this.viewMode.set('viewer');
  }

  openCreatorWizard(fromExisting?: CharacterSheetVm): void {
    const ancestries = this.catalog.ancestries();
    const classes = this.catalog.classes();
    const backgrounds = this.catalog.backgrounds();
    if (fromExisting) {
      this.isEditingCharacter.set(true);
      this.editingCharacterKey.set(fromExisting.characterKey);
      const scoreOf = (code: AbilityScoreVm['code']) => fromExisting.abilities.find((a) => a.code === code)?.score ?? 12;
      const matchedAncestry = ancestries.find((a) => fromExisting.ancestryOrClan.toLowerCase().includes(a.name.toLowerCase())) ?? ancestries[1];
      const matchedSubrace = matchedAncestry.subraces.find((sr) => fromExisting.subrace.toLowerCase().includes(sr.name.toLowerCase())) ?? matchedAncestry.subraces[0];
      const matchedClass = classes.find((c) => fromExisting.classOrArchetype.toLowerCase().includes(c.name.toLowerCase())) ?? classes[0];
      const matchedBg = backgrounds.find((b) => fromExisting.backgroundName.toLowerCase().includes(b.name.toLowerCase())) ?? backgrounds[0];

      this.creatorDraft.set({
        name: fromExisting.name, pronouns: fromExisting.pronouns, alignment: fromExisting.alignment,
        quote: fromExisting.quote, portraitUrl: fromExisting.portraitUrl, level: fromExisting.level,
        ancestryId: matchedAncestry.id, subraceId: matchedSubrace?.id ?? matchedAncestry.subraces[0]?.id ?? 'high-elf',
        classId: matchedClass.id, subclass: fromExisting.subclass || matchedClass.subclassDefault,
        backgroundId: matchedBg.id, selectedSkills: fromExisting.skills.filter((s) => s.proficient).map((s) => s.label),
        selectedFeatId: fromExisting.featureCards.find((f) => f.category === 'feat')?.title ?? 'Warcaster',
        startingPack: 'Starting Equipment',
        equipmentItems: [...fromExisting.equipment],
        equippedItemIds: fromExisting.equipment.filter((e) => e.equipped).map((e) => e.id),
        backpackItemIds: fromExisting.equipment.filter((e) => !e.equipped).map((e) => e.id),
        personalityTrait: fromExisting.personality.personality, ideal: fromExisting.personality.ideals,
        bond: fromExisting.personality.bonds, flaw: fromExisting.personality.flaws,
        abilities: { STR: scoreOf('STR'), DEX: scoreOf('DEX'), CON: scoreOf('CON'), INT: scoreOf('INT'), WIS: scoreOf('WIS'), CHA: scoreOf('CHA') },
      });
    } else {
      this.isEditingCharacter.set(false);
      this.editingCharacterKey.set(null);
      this.creatorStep.set(1);
      this.creatorDraft.update((cur) => ({
        ...cur, level: 1, equipmentItems: wizardDefaultEquipment('new'),
        abilities: { STR: 8, DEX: 14, CON: 14, INT: 15, WIS: 12, CHA: 10 },
      }));
    }
    this.viewMode.set('creator');
  }

  openSheetViewer(characterKey?: string): void {
    if (characterKey) this.selectedCharacterKey.set(characterKey);
    this.viewMode.set('viewer');
  }

  openStudioRoster(): void {
    this.viewMode.set('viewer');
  }

  updateCreatorDraft(patch: Partial<CharacterCreatorDraftVm>): void {
    this.creatorDraft.update((cur) => ({ ...cur, ...patch }));
  }

  updateCreatorAbility(code: AbilityScoreVm['code'], delta: number): void {
    const isEdit = this.isEditingCharacter();
    const minScore = isEdit ? 6 : 8;
    const maxScore = isEdit ? 20 : 18;
    this.creatorDraft.update((cur) => ({
      ...cur,
      abilities: { ...cur.abilities, [code]: Math.max(minScore, Math.min(maxScore, (cur.abilities[code] ?? 10) + delta)) },
    }));
  }

  toggleCreatorSkill(skillLabel: string): void {
    this.creatorDraft.update((cur) => {
      const exists = cur.selectedSkills.includes(skillLabel);
      return { ...cur, selectedSkills: exists ? cur.selectedSkills.filter((s) => s !== skillLabel) : [...cur.selectedSkills, skillLabel] };
    });
  }

  finalizeWizardCharacter(): CharacterSheetVm {
    const draft = this.creatorDraft();
    const ancestries = this.catalog.ancestries();
    const classes = this.catalog.classes();
    const backgrounds = this.catalog.backgrounds();
    const ancestry = ancestries.find((a) => a.id === draft.ancestryId) ?? ancestries[0];
    const subrace = ancestry.subraces.find((sr) => sr.id === draft.subraceId) ?? ancestry.subraces[0];
    const cls = classes.find((c) => c.id === draft.classId) ?? classes[0];
    const bg = backgrounds.find((b) => b.id === draft.backgroundId) ?? backgrounds[0];

    const cleanName = draft.name.trim() || 'Ciarán Fiachra';
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const editingKey = this.editingCharacterKey();
    const existingSheet = editingKey ? this.sheets().find((s) => s.characterKey === editingKey) : undefined;
    const charKey = existingSheet?.characterKey ?? `char-${slug}`;
    const profile = this.auth.activeProfile();

    const abilities: AbilityScoreVm[] = [
      { code: 'STR', label: 'Strength', score: draft.abilities.STR, modifier: 0 },
      { code: 'DEX', label: 'Dexterity', score: draft.abilities.DEX, modifier: 0 },
      { code: 'CON', label: 'Constitution', score: draft.abilities.CON, modifier: 0 },
      { code: 'INT', label: 'Intelligence', score: draft.abilities.INT, modifier: 0 },
      { code: 'WIS', label: 'Wisdom', score: draft.abilities.WIS, modifier: 0 },
      { code: 'CHA', label: 'Charisma', score: draft.abilities.CHA, modifier: 0 },
    ];
    const resolvedEquipment = draft.equipmentItems?.length ? [...draft.equipmentItems] : [...wizardDefaultEquipment(slug)];

    const targetCampaignId = existingSheet?.campaignId ?? this.store.activeCampaignId();
    const baseSheet: CharacterSheetVm = {
      compositeKey: `${targetCampaignId}:Character:${charKey}`, characterKey: charKey,
      ownerAccountId: existingSheet?.ownerAccountId ?? profile.accountId,
      ownerUsername: existingSheet?.ownerUsername ?? profile.username,
      campaignId: targetCampaignId, name: cleanName, roleBadge: 'Player Character',
      portraitUrl: draft.portraitUrl || subrace?.portraitUrl || ancestry.portraitUrl,
      pronouns: draft.pronouns || 'He/Him', alignment: draft.alignment || 'Neutral Good',
      quote: draft.quote || bg.defaultQuote, ancestryOrClan: ancestry.name,
      subrace: subrace?.name ?? ancestry.name, classOrArchetype: cls.name,
      subclass: draft.subclass || cls.subclassDefault, backgroundName: bg.name, backgroundSummary: bg.summary,
      tags: ['Party Member', subrace?.name ?? ancestry.name, bg.name, cls.name, 'Cinth'],
      systemCode: this.activeSystem(), level: draft.level ?? existingSheet?.level ?? 5,
      currentXp: existingSheet?.currentXp ?? 14250, nextLevelXp: existingSheet?.nextLevelXp ?? 15000,
      levelUpEligible: existingSheet?.levelUpEligible ?? true,
      maxHp: 32, currentHp: 32, armorClass: 15, initiativeBonus: 3, speedFeet: ancestry.speedFeet ?? 30,
      proficiencyBonus: 3, primaryAttackBonus: 7,
      actionEconomySummary: '1 Action · 1 Bonus Action · 1 Reaction · 30ft Move',
      abilities, savingThrows: buildSavingThrows(abilities, 3, cls.savingThrows),
      skills: buildSkillsList(abilities, 3, draft.selectedSkills),
      spellGroups: existingSheet?.spellGroups?.length ? existingSheet.spellGroups : cls.startingSpells,
      equipment: resolvedEquipment.length ? resolvedEquipment : wizardDefaultEquipment(slug),
      featureCards: [
        ...cls.features,
        ...ancestry.traits.map((t) => ({ id: `anc-${slug}-${t.id}`, title: `${ancestry.name}: ${t.title}`, category: 'ancestry' as const, summary: t.description, icon: t.icon, tone: 'emerald' as const })),
        { id: `feat-${slug}-custom`, title: draft.selectedFeatId || 'Warcaster', category: 'feat', summary: 'Selected Feat & Tactical Mastery.', icon: 'swords', tone: 'gold' },
      ],
      features: [...cls.features.map((f) => f.title), ...ancestry.traits.map((t) => t.title), draft.selectedFeatId || 'Warcaster'],
      personality: {
        personality: draft.personalityTrait || bg.personality.personality,
        ideals: draft.ideal || bg.personality.ideals,
        bonds: draft.bond || bg.personality.bonds,
        flaws: draft.flaw || bg.personality.flaws,
      },
      connections: existingSheet?.connections ?? DEFAULT_CONNECTIONS,
      notes: existingSheet?.notes ?? [`Created in Character Studio for ${this.store.activeCampaign().name}.`],
      richNotes: existingSheet?.richNotes ?? [],
      metEntities: existingSheet?.metEntities ?? this.catalog.metEntities(),
      campaignHistory: existingSheet?.campaignHistory ?? this.catalog.campaignHistory(),
      historyEvents: existingSheet?.historyEvents ?? [`Created as a ${subrace?.name ?? ancestry.name} ${cls.name}.`],
    };

    const calculated = this.recalculate(baseSheet, this.activeSystem());
    this.sheets.update((prev) => [calculated, ...prev.filter((s) => s.characterKey !== charKey)]);
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
    this.sheets.update((list) =>
      list.map((sheet) => {
        if (sheet.characterKey !== key) return sheet;
        const abilities = sheet.abilities.map((a) => (a.code === code ? { ...a, score: Math.max(6, Math.min(22, a.score + delta)) } : a));
        return this.recalculate({ ...sheet, abilities }, this.activeSystem());
      }),
    );
  }

  toggleEquipment(equipmentId: string): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) =>
      list.map((sheet) => {
        if (sheet.characterKey !== key) return sheet;
        const equipment = sheet.equipment.map((eq) => (eq.id === equipmentId ? { ...eq, equipped: !eq.equipped } : eq));
        return this.recalculate({ ...sheet, equipment }, this.activeSystem());
      }),
    );
  }

  addEquipmentFromDatabase(item: EquipmentLoadoutItemVm, equipNow: boolean): void {
    const key = this.selectedCharacterKey();
    const newItem: EquipmentLoadoutItemVm = { ...item, id: `${item.id}-${Date.now().toString(36).slice(-4)}`, equipped: equipNow };
    this.sheets.update((list) =>
      list.map((sheet) => (sheet.characterKey === key ? this.recalculate({ ...sheet, equipment: [newItem, ...sheet.equipment] }, this.activeSystem()) : sheet)),
    );
  }

  removeEquipmentItem(equipmentId: string): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) =>
      list.map((sheet) => (sheet.characterKey === key ? this.recalculate({ ...sheet, equipment: sheet.equipment.filter((e) => e.id !== equipmentId) }, this.activeSystem()) : sheet)),
    );
  }

  toggleSpellPrepared(spellId: string): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) =>
      list.map((sheet) => {
        if (sheet.characterKey !== key) return sheet;
        const spellGroups = sheet.spellGroups.map((grp) => ({
          ...grp,
          spells: grp.spells.map((sp) => (sp.id === spellId ? { ...sp, prepared: grp.isCantrip ? true : !sp.prepared } : sp)),
        }));
        return { ...sheet, spellGroups };
      }),
    );
  }

  addSpellToActiveCharacter(spell: CharacterSpellVm, prepared: boolean): void {
    const key = this.selectedCharacterKey();
    const isCantrip = (spell.level ?? 1) === 0;
    const groupId = isCantrip ? 'cantrips' : `level-${spell.level ?? 1}`;
    const groupLabel = isCantrip ? 'Cantrips (Always Prepared)' : `Level ${spell.level ?? 1} Spells`;
    this.sheets.update((list) =>
      list.map((sheet) => {
        if (sheet.characterKey !== key) return sheet;
        const existsGrp = sheet.spellGroups.some((g) => g.groupId === groupId);
        const spellEntry: CharacterSpellVm = { ...spell, prepared: isCantrip ? true : prepared };
        const spellGroups = existsGrp
          ? sheet.spellGroups.map((g) => (g.groupId === groupId && !g.spells.some((s) => s.name === spell.name) ? { ...g, spells: [...g.spells, spellEntry] } : g))
          : [...sheet.spellGroups, { groupId, label: groupLabel, slotsRemaining: 2, slotsMax: 2, isCantrip, spells: [spellEntry] }];
        return { ...sheet, spellGroups };
      }),
    );
  }

  unlockEquipment(equipmentId: string): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) =>
      list.map((sheet) => {
        if (sheet.characterKey !== key) return sheet;
        const equipment = sheet.equipment.map((eq) => (eq.id === equipmentId ? { ...eq, entitlement: 'purchased' as const, equipped: true } : eq));
        return this.recalculate({ ...sheet, equipment }, this.activeSystem());
      }),
    );
  }

  setActiveCharacterPortrait(portraitUrl: string): void {
    if (!portraitUrl) return;
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((sheet) => (sheet.characterKey === key ? { ...sheet, portraitUrl } : sheet)));
  }

  cyclePortrait(): void {
    this.setActiveCharacterPortrait('/assets/5e-tools/races/PHB/Elf.webp');
  }

  executeLevelUp(featureName: string, abilityBoost: AbilityScoreVm['code']): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) =>
      list.map((sheet) => {
        if (sheet.characterKey !== key) return sheet;
        const nextLevel = sheet.level + 1;
        const abilities = sheet.abilities.map((a) => (a.code === abilityBoost ? { ...a, score: Math.min(22, a.score + 1) } : a));
        const features = [...sheet.features, `Lv.${nextLevel}: ${featureName}`];
        const featureCards = [
          ...sheet.featureCards,
          { id: `feat-lv-${nextLevel}`, title: `Lv.${nextLevel} · ${featureName} (+1 ${abilityBoost})`, category: 'feat' as const, summary: `Unlocked at Level ${nextLevel} along with +1 ${abilityBoost}.`, icon: 'zap', tone: 'gold' as const },
        ];
        const historyEvents = [`Advanced to Level ${nextLevel}: selected ${featureName} and +1 ${abilityBoost}.`, ...sheet.historyEvents];
        return this.recalculate({ ...sheet, level: nextLevel, nextLevelXp: sheet.nextLevelXp + 14000, abilities, features, featureCards, historyEvents }, this.activeSystem());
      }),
    );
  }

  addCharacterNote(text: string): void {
    const clean = text.trim();
    if (!clean) return;
    const key = this.selectedCharacterKey();
    this.sheets.update((list) => list.map((s) => (s.characterKey === key ? { ...s, notes: [clean, ...s.notes] } : s)));
  }

  addRichCharacterNote(note: CharacterRichNoteVm): void {
    const key = this.selectedCharacterKey();
    this.sheets.update((list) =>
      list.map((s) =>
        s.characterKey === key
          ? { ...s, richNotes: [note, ...(s.richNotes ?? [])], notes: [`[${note.visibility.toUpperCase()}] ${note.title}: ${note.contentText}`, ...s.notes] }
          : s,
      ),
    );
    this.catalog.syncNoteToLoom(this.store.activeCampaignId(), note);
  }

  createCharacter(name: string, ancestry: string, archetype: string): void {
    this.updateCreatorDraft({ name: name.trim() || 'Vandia Vanguard', subclass: archetype });
    const created = this.finalizeWizardCharacter();
    this.sheets.update((list) =>
      list.map((s) => (s.characterKey === created.characterKey ? this.recalculate({ ...s, ancestryOrClan: ancestry, classOrArchetype: archetype, level: 7 }, this.activeSystem()) : s)),
    );
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
    const abilities: AbilityScoreVm[] = sheet.abilities.map((a) => ({
      ...a,
      modifier: systemCode === 'vampire_v5' ? Math.max(1, Math.min(5, Math.round(a.score / 4))) : Math.floor((a.score - 10) / 2),
    }));
    const dexMod = abilities.find((a) => a.code === 'DEX')?.modifier ?? 2;
    const conMod = abilities.find((a) => a.code === 'CON')?.modifier ?? 2;
    const strMod = abilities.find((a) => a.code === 'STR')?.modifier ?? 2;
    const intMod = abilities.find((a) => a.code === 'INT')?.modifier ?? 2;
    const prof = systemCode === 'pf2e' ? sheet.level + 2 : systemCode === 'vampire_v5' ? Math.min(5, 1 + Math.floor(sheet.level / 3)) : 2 + Math.floor((sheet.level - 1) / 4);

    const eqAc = sheet.equipment.filter((e) => e.equipped).reduce((s, e) => s + e.acBonus, 0);
    const eqAtk = sheet.equipment.filter((e) => e.equipped).reduce((s, e) => s + e.attackBonus, 0);
    const isWizard = sheet.classOrArchetype.toLowerCase().includes('wizard');
    const baseAc = systemCode === 'pf2e' ? 10 + prof : isWizard ? 10 : 12;
    const armorClass = baseAc + Math.min(3, dexMod) + eqAc;
    const maxHp = isWizard ? (4 + conMod) * sheet.level + 2 : (7 + conMod) * sheet.level + 12;
    const primaryStatMod = isWizard ? intMod : Math.max(strMod, dexMod);
    const primaryAttackBonus = primaryStatMod + prof + eqAtk;
    const proficientSaves = sheet.savingThrows.filter((s) => s.proficient).map((s) => s.code);
    const savingThrows = buildSavingThrows(abilities, prof, proficientSaves.length ? proficientSaves : ['INT', 'WIS']);
    const proficientSkills = sheet.skills.filter((sk) => sk.proficient).map((sk) => sk.label);
    const skills = buildSkillsList(abilities, prof, proficientSkills);

    return {
      ...sheet, systemCode, abilities, savingThrows, skills,
      proficiencyBonus: prof, armorClass, maxHp, currentHp: maxHp,
      initiativeBonus: dexMod, primaryAttackBonus,
      actionEconomySummary: '1 Action · 1 Bonus Action · 1 Reaction · 30ft Move',
      metEntities: sheet.metEntities ?? this.catalog.metEntities(),
      campaignHistory: sheet.campaignHistory ?? this.catalog.campaignHistory(),
      levelUpEligible: sheet.currentXp >= sheet.nextLevelXp || sheet.levelUpEligible,
    };
  }
}
