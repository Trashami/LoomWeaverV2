import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { LwMonsterSummaryVm } from '../../../../shared/ui/public-api';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';
import { VttCombatService } from '../../services/vtt-combat.service';
import { VttServerSyncService } from '../../services/vtt-server-sync.service';
import { DndSizeCategory } from '../../../effects/engine/effect-timeline.contract';
import { VttDisplaySettingsService } from '../../services/vtt-display-settings.service';
import { SEED_VTT_WALL_SEGMENTS } from '../../services/vtt-battle.seed';
import { CharacterStudioService } from '../../../characters/services/character-studio.service';
import { BestiaryCatalogService, CR_BANDS } from '../../../bestiary/services/bestiary-catalog.service';
import { VttFogBrushMode, VttFogBrushShape, VttFogMode } from '../../models/vtt-battle.models';

export type LeftMapTool = 'select' | 'draw' | 'light' | 'tokens' | 'view' | 'measure';
export type TokenMenuAddTab = 'characters' | 'npcs' | 'monsters';

@Component({
  selector: 'lw-vtt-map-tools',
  standalone: true,
  imports: [FormsModule, NgpButton, LwIconComponent],
  templateUrl: './vtt-map-tools.component.html',
  styleUrl: './vtt-map-tools.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttMapToolsComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly battle = inject(VttBattleStateService);
  readonly vtt = inject(VttCombatService);
  readonly serverSync = inject(VttServerSyncService);
  readonly vttDisplay = inject(VttDisplaySettingsService);
  readonly characterStudio = inject(CharacterStudioService);
  readonly bestiary = inject(BestiaryCatalogService);

  readonly gridEnabled = model<boolean>(false);
  readonly railOpen = model<boolean>(false);
  readonly rollDice = output<void>();
  readonly openShortcuts = output<void>();

  readonly showMapTools = signal<boolean>(true);
  readonly activeLeftTool = signal<LeftMapTool | null>(null);
  readonly activeTokenAddTab = signal<TokenMenuAddTab>('characters');
  readonly monsterSpawnCount = signal<number>(1);
  readonly customNpcName = signal<string>('');
  readonly customNpcDisposition = signal<'Friendly' | 'Neutral' | 'Hostile'>('Friendly');

  readonly paletteTools: readonly { id: LeftMapTool; icon: string; label: string; title: string }[] = [
    { id: 'select', icon: 'cursor', label: 'Select', title: 'Selection & Controls' },
    { id: 'draw', icon: 'pen', label: 'Draw', title: 'Drawing & Walls' },
    { id: 'light', icon: 'zap', label: 'Light', title: 'Fog of War, Vision & Lighting' },
    { id: 'tokens', icon: 'users', label: 'Tokens', title: 'Tokens & Combatants' },
    { id: 'view', icon: 'eye', label: 'View', title: 'View & Grid Controls' },
    { id: 'measure', icon: 'ruler', label: 'Measure', title: 'Measure Distance & AoE' },
  ];

  readonly fogModeOptions: readonly { id: VttFogMode; label: string }[] = [
    { id: 'explored-los', label: 'Keep Traveled Cleared' },
    { id: 'los-only', label: 'Reapply Fog (LoS Only)' },
    { id: 'manual-only', label: 'Manual Brush Only' },
    { id: 'no-fog', label: 'No Fog of War' },
  ];

  readonly crBands = CR_BANDS;
  readonly monsterTypes: readonly string[] = [
    'all', 'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental',
    'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead',
  ];

  readonly isGm = computed(() => this.store.viewerRole() === 'gm');
  readonly visiblePaletteTools = computed(() =>
    this.isGm()
      ? this.paletteTools
      : this.paletteTools.filter((t) => t.id !== 'light' && t.id !== 'draw'),
  );
  readonly partyCount = computed(() => this.vtt.partyTokensInScene().length);

  constructor() {
    this.bestiary.ensureLoaded();
  }
  readonly hostileCount = computed(() =>
    this.battle.visibleMapTokens().filter((t) => t.faction === 'hostile').length,
  );
  readonly totalTokensCount = computed(() => this.battle.visibleMapTokens().length);
  readonly campaignCharacters = computed(() => this.characterStudio.campaignSheets());

  readonly campaignNpcs = computed(() => {
    const encounterNpcs = this.vtt.npcs();
    const scoped = this.battle.scopedNpcs();
    const seen = new Set<string>();
    const combined: { id: string; name: string; role: string; disposition: string }[] = [];
    for (const n of encounterNpcs) {
      seen.add(n.name.toLowerCase());
      combined.push({ id: n.compositeKey, name: n.name, role: n.title, disposition: n.disposition });
    }
    for (const s of scoped) {
      if (!seen.has(s.name.toLowerCase())) {
        seen.add(s.name.toLowerCase());
        combined.push({ id: s.id, name: s.name, role: s.title, disposition: s.disposition });
      }
    }
    return combined;
  });

  readonly filteredMonsterLibrary = computed<readonly LwMonsterSummaryVm[]>(() => {
    const serverMonsters = this.bestiary.monsters();
    if (serverMonsters.length > 0) return serverMonsters;
    const q = this.bestiary.searchQuery().trim().toLowerCase();
    const typeFilter = this.bestiary.typeFilter().toLowerCase();
    return this.vtt
      .monsterCatalog()
      .filter((m) => {
        if (q && !m.name.toLowerCase().includes(q) && !m.creatureType.toLowerCase().includes(q)) return false;
        if (typeFilter !== 'all' && !m.creatureType.toLowerCase().includes(typeFilter)) return false;
        return true;
      })
      .map((m) => ({
        key: m.id,
        name: m.name,
        imageUrl: '',
        tokenUrl: '',
        shortDescription: m.summary || '',
        challengeRating: String(m.challengeRating),
        crValue: Number(m.challengeRating) || 1,
        creatureType: m.creatureType,
        size: 'Medium',
        source: 'LoomWeaver',
        armorClass: m.armorClass,
        hitPoints: m.maxHp,
        isCustom: false,
        isPublished: true,
        creatorUsername: null,
        ownedByViewer: false,
      }));
  });

  isPaletteToolActive(id: LeftMapTool): boolean {
    if (this.activeLeftTool() === id) return true;
    if (id === 'light' && this.battle.fogBrushMode() !== 'none') return true;
    if (id === 'view' && this.vttDisplay.calibratingGrid()) return true;
    if (id === 'measure' && this.battle.measureEnabled()) return true;
    return false;
  }

  toggleLeftTool(tool: LeftMapTool): void {
    if (this.activeLeftTool() === tool) {
      this.activeLeftTool.set(null);
    } else {
      this.activeLeftTool.set(tool);
      if (tool === 'tokens') this.bestiary.ensureLoaded();
    }
  }

  selectTokenAddTab(tab: TokenMenuAddTab): void {
    this.activeTokenAddTab.set(tab);
    if (tab === 'monsters') this.bestiary.ensureLoaded();
  }

  isCharacterOnMap(characterId: string, name: string): boolean {
    const norm = name.trim().toLowerCase();
    return this.vtt.tokens().some(
      (t) =>
        t.key === `1:PC:${characterId}` ||
        t.name.trim().toLowerCase() === norm ||
        t.name.trim().toLowerCase().startsWith(norm.split(' ')[0]),
    );
  }

  addOrFocusCampaignCharacter(characterId: string): void {
    this.vtt.addCampaignCharacterToMap(characterId);
  }

  ensureAllCampaignCharactersOnMap(): void {
    for (const sheet of this.campaignCharacters()) {
      this.vtt.addCampaignCharacterToMap(sheet.characterKey);
    }
  }

  addNpcToMap(npcId: string, name: string, role: string, disposition: string): void {
    const existing = this.vtt.npcs().find((n) => n.compositeKey === npcId);
    if (existing) {
      this.vtt.addNpcToEncounter(npcId);
    } else {
      this.battle.quickAddNpcToEncounter(
        name,
        role,
        'Encounter',
        (disposition as 'Friendly' | 'Neutral' | 'Deceptive' | 'Hostile') || 'Friendly',
        true,
      );
    }
  }

  createAndAddCustomNpc(): void {
    const name = this.customNpcName().trim();
    if (!name) return;
    this.battle.quickAddNpcToEncounter(name, 'Campaign NPC', 'Encounter', this.customNpcDisposition(), true);
    this.customNpcName.set('');
  }

  onMonsterSearchInput(query: string): void {
    this.bestiary.setSearch(query);
  }

  onMonsterTypeChange(type: string): void {
    this.bestiary.setFilter(() => this.bestiary.typeFilter.set(type));
  }

  onMonsterCrBandChange(bandId: string): void {
    this.bestiary.setFilter(() => this.bestiary.crBandId.set(bandId));
  }

  spawnMonsterFromLibrary(monster: LwMonsterSummaryVm): void {
    this.vtt.addBestiaryMonsterToMap(monster, this.monsterSpawnCount());
  }

  setFogMode(mode: VttFogMode): void {
    this.battle.fogMode.set(mode);
  }

  setFogBrushMode(mode: VttFogBrushMode): void {
    this.battle.fogBrushMode.set(this.battle.fogBrushMode() === mode ? 'none' : mode);
  }

  setFogBrushShape(shape: VttFogBrushShape): void {
    this.battle.fogBrushShape.set(shape);
  }

  onFogBrushRadiusInput(rawFeet: string): void {
    this.battle.fogBrushRadiusFeet.set(Math.max(5, Math.min(80, Number(rawFeet) || 20)));
  }

  onTraveledFogOpacityInput(rawPercent: string): void {
    const pct = Math.max(5, Math.min(92, Number(rawPercent) || 58));
    this.battle.traveledFogOpacity.set(Number((pct / 100).toFixed(2)));
  }

  onGmFogOpacityInput(rawPercent: string): void {
    const pct = Math.max(10, Math.min(88, Number(rawPercent) || 48));
    this.battle.gmFogOpacity.set(Number((pct / 100).toFixed(2)));
  }

  deselectAll(): void {
    this.vtt.selectedAttackerKey.set('');
    this.battle.previewTokenVisionKey.set(null);
    this.battle.queuedTargetSequence.set([]);
    this.battle.cancelAllInteractiveModes();
    this.vttDisplay.calibratingGrid.set(false);
    this.activeLeftTool.set(null);
  }

  toggleTargeting(): void {
    this.battle.targetSelectionMode.set(!this.battle.targetSelectionMode());
  }

  clearAllWalls(): void {
    this.battle.walls.set([]);
  }

  resetDefaultWalls(): void {
    this.battle.walls.set(SEED_VTT_WALL_SEGMENTS);
  }

  readonly gridScale = computed(() => this.vttDisplay.gridScale());
  readonly gridScalePercent = computed(() => Math.round(this.vttDisplay.gridScale() * 100));

  increaseGridScale(): void {
    this.gridEnabled.set(true);
    const next = Math.round((this.vttDisplay.gridScale() + 0.05) * 100) / 100;
    this.vttDisplay.setGridScale(Math.min(2.5, next));
  }

  decreaseGridScale(): void {
    this.gridEnabled.set(true);
    const next = Math.round((this.vttDisplay.gridScale() - 0.05) * 100) / 100;
    this.vttDisplay.setGridScale(Math.max(0.25, next));
  }

  onGridScaleInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) {
      this.gridEnabled.set(true);
      this.vttDisplay.setGridScale(val);
    }
  }

  startDrawSquareCalibration(): void {
    const next = !this.vttDisplay.calibratingGrid();
    this.vttDisplay.calibratingGrid.set(next);
    if (next) {
      this.gridEnabled.set(true);
      this.battle.mapMode3D.set(false);
      this.activeLeftTool.set(null);
    }
  }

  readonly activeTokenForSize = computed(() => {
    const key = this.vtt.selectedAttackerKey() || this.battle.activeObserverToken()?.key;
    return this.vtt.tokens().find((t) => t.key === key) ?? this.vtt.tokens()[0] ?? null;
  });

  readonly activeTokenSize = computed<DndSizeCategory>(() => {
    return (this.activeTokenForSize()?.sizeCategory || 'medium') as DndSizeCategory;
  });

  readonly dndSizes: readonly { id: DndSizeCategory; label: string; space: string }[] = [
    { id: 'tiny', label: 'Tiny', space: '2.5 ft' },
    { id: 'small', label: 'Small', space: '5 ft' },
    { id: 'medium', label: 'Medium', space: '5 ft' },
    { id: 'large', label: 'Large', space: '10 ft' },
    { id: 'huge', label: 'Huge', space: '15 ft' },
    { id: 'gargantuan', label: 'Gargantuan', space: '20+ ft' },
  ];

  selectTokenForSize(key: string): void {
    this.vtt.selectedAttackerKey.set(key);
  }

  setTokenSize(size: DndSizeCategory): void {
    const t = this.activeTokenForSize();
    if (!t) return;
    this.vtt.setTokenSizeCategory(t.key, size);
  }
}
