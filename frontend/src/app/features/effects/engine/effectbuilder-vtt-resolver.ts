import {
  EffectDefinition,
  createEffect,
  createFireballComposition,
  createFireHitEffect,
  createLayer,
  createMageHandEffect,
  createMagicMissileEffect,
  makePresets,
  parseEffect,
} from '@effectbuilder/effect-definition';
import { makeSpellTemplates } from '@effectbuilder/spell-templates';
import { EffectTimelinePresetVm } from './effect-timeline.contract';

interface CampaignAssignmentDto {
  readonly id?: string;
  readonly campaignId?: number;
  readonly characterId?: number;
  readonly spellName?: string;
  readonly effectId?: string;
  readonly effect?: unknown;
}

interface LibraryEffectDto {
  readonly id?: string;
  readonly name?: string;
  readonly spellName?: string;
  readonly effect?: unknown;
}

const DRAFT_STORAGE_KEY = 'mw-effectbuilder-draft-v1';

function normalizeKey(value: string | undefined | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class EffectBuilderVttResolver {
  private readonly assignmentsByCampaign = new Map<number, CampaignAssignmentDto[]>();
  private readonly loadingCampaigns = new Set<number>();
  private libraryEffects: EffectDefinition[] = [];
  private libraryLoaded = false;
  private libraryLoading = false;
  private builtInTemplates: EffectDefinition[] | null = null;

  prefetchForCampaign(campaignId: number): void {
    this.ensureLibraryLoaded();
    if (!campaignId || campaignId <= 0) return;
    if (this.assignmentsByCampaign.has(campaignId) || this.loadingCampaigns.has(campaignId)) return;
    if (typeof fetch === 'undefined') return;

    this.loadingCampaigns.add(campaignId);
    fetch(`/api/effects/campaigns/${campaignId}/assignments`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        if (Array.isArray(rows)) {
          this.assignmentsByCampaign.set(campaignId, rows as CampaignAssignmentDto[]);
        }
      })
      .catch(() => {})
      .finally(() => {
        this.loadingCampaigns.delete(campaignId);
      });
  }

  private ensureLibraryLoaded(): void {
    if (this.libraryLoaded || this.libraryLoading || typeof fetch === 'undefined') return;
    this.libraryLoading = true;
    fetch('/api/effects/library', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        this.libraryLoaded = true;
        if (!Array.isArray(rows)) return;
        const parsed: EffectDefinition[] = [];
        for (const item of rows as LibraryEffectDto[]) {
          const def = this.safeParseEffect(item?.effect ?? item);
          if (def) parsed.push(def);
        }
        this.libraryEffects = parsed;
      })
      .catch(() => {})
      .finally(() => {
        this.libraryLoading = false;
      });
  }

  resolveEffectDefinition(params: {
    readonly abilityName?: string;
    readonly characterId?: number;
    readonly campaignId?: number;
    readonly preset: EffectTimelinePresetVm;
  }): EffectDefinition {
    const campaignId = params.campaignId ?? 0;
    if (campaignId > 0) {
      this.prefetchForCampaign(campaignId);
    } else {
      this.ensureLibraryLoaded();
    }

    const rawAbility = params.abilityName || params.preset.name || 'Arcane Bolt';
    const normAbility = normalizeKey(rawAbility);

    // 1. Check Campaign Spell Effect Assignments (character-specific first, then campaign-wide)
    const assigned = this.findAssignedCampaignEffect(campaignId, params.characterId ?? 0, normAbility);
    if (assigned) return assigned;

    // 2. Check Local EffectBuilder Studio Draft (`mw-effectbuilder-draft-v1`)
    const draft = this.readLocalDraftEffect();
    if (draft) {
      const draftSpell = normalizeKey(draft.spellName);
      const draftName = normalizeKey(draft.name);
      if (
        (draftSpell && (normAbility.includes(draftSpell) || draftSpell.includes(normAbility))) ||
        (draftName && (normAbility.includes(draftName) || draftName.includes(normAbility)))
      ) {
        return draft;
      }
    }

    // 3. Check User's Saved EffectBuilder Library
    for (const lib of this.libraryEffects) {
      const libSpell = normalizeKey(lib.spellName);
      const libName = normalizeKey(lib.name);
      if (
        (libSpell && (normAbility.includes(libSpell) || libSpell.includes(normAbility))) ||
        (libName && (normAbility.includes(libName) || libName.includes(normAbility)))
      ) {
        return lib;
      }
    }

    // 4. Match Built-in EffectBuilder Studio Spell Templates & Presets
    const templateMatch = this.matchBuiltInTemplate(normAbility);
    if (templateMatch) return templateMatch;

    // 5. Synthesize a rich multi-layer EffectBuilder EffectDefinition from preset & ability keywords
    return this.buildSynthesizedEffect(rawAbility, normAbility, params.preset);
  }

  private findAssignedCampaignEffect(
    campaignId: number,
    characterId: number,
    normAbility: string,
  ): EffectDefinition | null {
    if (!normAbility) return null;
    const list = this.assignmentsByCampaign.get(campaignId) ?? [];
    if (list.length === 0) return null;

    if (characterId > 0) {
      const exactChar = list.find(
        (a) =>
          (a.characterId ?? 0) === characterId &&
          this.matchesSpellKey(normalizeKey(a.spellName), normAbility),
      );
      const parsedChar = exactChar ? this.safeParseEffect(exactChar.effect) : null;
      if (parsedChar) return parsedChar;
    }

    const anyMatch = list.find((a) =>
      this.matchesSpellKey(normalizeKey(a.spellName), normAbility),
    );
    return anyMatch ? this.safeParseEffect(anyMatch.effect) : null;
  }

  private matchesSpellKey(candidate: string, query: string): boolean {
    if (!candidate || !query) return false;
    return candidate === query || query.includes(candidate) || candidate.includes(query);
  }

  private readLocalDraftEffect(): EffectDefinition | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      return this.safeParseEffect(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private safeParseEffect(raw: unknown): EffectDefinition | null {
    if (!raw) return null;
    try {
      return parseEffect(raw);
    } catch {
      return null;
    }
  }

  private getBuiltInTemplates(): EffectDefinition[] {
    if (!this.builtInTemplates) {
      this.builtInTemplates = [
        createFireballComposition(),
        createMagicMissileEffect(),
        createFireHitEffect(),
        createMageHandEffect(),
        ...makeSpellTemplates(),
        ...makePresets(),
      ];
    }
    return this.builtInTemplates;
  }

  private matchBuiltInTemplate(normAbility: string): EffectDefinition | null {
    const templates = this.getBuiltInTemplates();

    for (const t of templates) {
      const sp = normalizeKey(t.spellName);
      const nm = normalizeKey(t.name);
      if ((sp && this.matchesSpellKey(sp, normAbility)) || (nm && this.matchesSpellKey(nm, normAbility))) {
        return t;
      }
    }

    if (/magic missile|arcane barrage|dart/.test(normAbility)) return createMagicMissileEffect();
    if (/fireball|meteor|eruption|explosion|alchemist|bomb/.test(normAbility)) return createFireballComposition();
    if (/mage hand|spectral hand|telekinesis/.test(normAbility)) return createMageHandEffect();

    const findBySpell = (spell: string): EffectDefinition | null =>
      templates.find((t) => normalizeKey(t.spellName) === normalizeKey(spell)) ?? null;

    if (/fire bolt|scorching ray|produce flame|chrom/.test(normAbility)) return findBySpell('Fire Bolt');
    if (/burning hands|dragon breath|flame/.test(normAbility)) return findBySpell('Burning Hands');
    if (/cone of cold|frost|ice|blizzard|rime/.test(normAbility)) return findBySpell('Cone of Cold');
    if (/lightning|shocking|witch bolt|storm|call lightning/.test(normAbility)) return findBySpell('Lightning Bolt');
    if (/eldritch|disintegrate|arcane|ray|beam/.test(normAbility)) return findBySpell('Eldritch Blast');
    if (/guiding bolt|sacred flame|radiant|sunbeam|moonbeam|smite/.test(normAbility)) return findBySpell('Guiding Bolt');
    if (/cure|heal|restoration|word|bless|aid/.test(normAbility)) return findBySpell('Cure Wounds');
    if (/shield|ward|mage armor|sanctuary|seal|aegis/.test(normAbility)) return findBySpell('Shield');
    if (/thorn|whip|vine|entangle|grasp/.test(normAbility)) return findBySpell('Thorn Whip');
    if (/shatter|thunder|sonic|booming/.test(normAbility)) return findBySpell('Shatter');
    if (/necrotic|blight|chill touch|toll|hex|curse|inflict/.test(normAbility)) return findBySpell('Blight');
    if (/acid|poison|venom|spray|miasma/.test(normAbility)) return findBySpell('Acid Splash');
    return null;
  }

  private buildSynthesizedEffect(
    rawAbility: string,
    normAbility: string,
    preset: EffectTimelinePresetVm,
  ): EffectDefinition {
    const primary = /^#[0-9a-f]{6}$/i.test(preset.primaryColorHex) ? preset.primaryColorHex : '#49e892';
    const secondary = /^#[0-9a-f]{6}$/i.test(preset.secondaryColorHex) ? preset.secondaryColorHex : '#d9fff0';

    if (preset.trajectoryType === 'beam') {
      const e = createEffect(rawAbility, 'beam');
      e.spellName = rawAbility;
      Object.assign(e.layers[0], {
        variant: 'helix',
        color: primary,
        secondaryColor: secondary,
        size: 16,
        duration: 850,
      });
      const impact = createLayer('burst');
      Object.assign(impact, {
        variant: 'radial',
        anchor: 'target',
        color: primary,
        secondaryColor: secondary,
        delay: 180,
        duration: 750,
        size: 46,
      });
      e.layers.push(impact);
      return e;
    }

    if (preset.trajectoryType === 'cone') {
      const e = createEffect(rawAbility, 'cone');
      e.spellName = rawAbility;
      Object.assign(e.layers[0], {
        variant: 'flame',
        color: primary,
        secondaryColor: secondary,
        size: 56,
        duration: 950,
      });
      return e;
    }

    if (preset.trajectoryType === 'sigil') {
      const e = createEffect(rawAbility, 'burst');
      e.spellName = rawAbility;
      Object.assign(e.layers[0], {
        variant: 'radial',
        anchor: 'target',
        color: primary,
        secondaryColor: secondary,
        size: 72,
        duration: 950,
      });
      const ring = createLayer('ring');
      Object.assign(ring, {
        variant: 'shockwave',
        anchor: 'target',
        color: secondary,
        secondaryColor: primary,
        size: 78,
        duration: 800,
      });
      e.layers.push(ring);
      return e;
    }

    const isWeapon = /sword|axe|mace|hammer|dagger|spear|pike|halberd|club|rapier|scimitar|bow|crossbow|sling|arrow|bolt|claw|bite|slam|strike|slash/.test(
      normAbility,
    );
    const e = createEffect(rawAbility, 'projectile');
    e.spellName = rawAbility;
    Object.assign(e.layers[0], {
      variant: isWeapon ? 'shard' : 'comet',
      color: primary,
      secondaryColor: secondary,
      size: isWeapon ? 18 : 26,
      duration: 620,
    });
    const hit = createLayer('burst');
    Object.assign(hit, {
      variant: isWeapon ? 'shatter' : 'radial',
      anchor: 'target',
      color: primary,
      secondaryColor: secondary,
      delay: 540,
      duration: 650,
      size: 44,
    });
    const sparks = createLayer('sparks');
    Object.assign(sparks, {
      variant: 'fountain',
      anchor: 'target',
      color: secondary,
      secondaryColor: primary,
      delay: 550,
      duration: 720,
      size: 10,
      count: 32,
    });
    e.layers.push(hit, sparks);
    return e;
  }
}
