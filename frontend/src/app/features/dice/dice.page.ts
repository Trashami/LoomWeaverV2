import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit, ChangeDetectionStrategy, Component, computed,
  ElementRef, inject, OnDestroy, OnInit, signal, ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { LwAlertifyService } from '../../core/services/lw-alertify.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  DicePoolRollRequest, LwButtonComponent, LwDiceForgeInspectorComponent,
  LwDiceForgeSubbarComponent, LwDiceRollerMenuComponent, LwDiceToolDockComponent, LwIconComponent,
} from '../../shared/ui';
import { buildDefaultMarketplaceDicePresets } from './dice-marketplace-defaults';
import { DICE_SOUND_PROFILES, DiceSoundService } from './engine/audio';
import { BabylonDiceStageService } from './engine/babylon-dice-stage.service';
import { DEFAULT_DICE_PHYSICS_CONFIG, DiceForgeToolId, DicePhysicsConfig } from './engine/dice-physics.types';
import { DICE_CRITFAIL_EFFECTS, DICE_NAT20_EFFECTS } from './engine/effects';
import { DICE_MODEL_CATALOG, DiceModelDefinition, DicePolyhedronType, resolveDiceModel } from './engine/models';
import {
  createDefaultRuntimeConfigFromSkin, DICE_SKIN_CATALOG, DiceCustomRuntimeConfig,
  DiceSkinConfig, MarketplaceDicePreset, resolveDiceSkin, SavedUserDicePreset,
} from './engine/skins';

const USER_PRESETS_STORAGE_KEY = 'lw_user_dice_presets_v2';
const ACTIVE_CONFIG_STORAGE_KEY = 'lw_active_dice_config_v2';

@Component({
  selector: 'app-dice-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, LwButtonComponent, LwIconComponent,
    LwDiceForgeSubbarComponent, LwDiceToolDockComponent, LwDiceRollerMenuComponent, LwDiceForgeInspectorComponent,
  ],
  templateUrl: './dice.page.html',
  styleUrl: './dice.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DicePageComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly auth = inject(AuthSessionService);
  private readonly alertify = inject(LwAlertifyService);
  readonly stageService = inject(BabylonDiceStageService);
  readonly soundService = inject(DiceSoundService);

  @ViewChild('diceStageCanvas') diceStageCanvas?: ElementRef<HTMLCanvasElement>;

  readonly skinCatalog = signal<readonly DiceSkinConfig[]>(DICE_SKIN_CATALOG);
  readonly modelCatalog = signal<readonly DiceModelDefinition[]>(DICE_MODEL_CATALOG);
  readonly nat20Effects = signal(DICE_NAT20_EFFECTS);
  readonly critFailEffects = signal(DICE_CRITFAIL_EFFECTS);
  readonly soundProfiles = signal(DICE_SOUND_PROFILES);

  readonly activeTool = signal<DiceForgeToolId>('skin');
  readonly inspectorOpen = signal<boolean>(true);
  readonly focusDie = signal<DicePolyhedronType | 'all'>('all');
  readonly marketModalOpen = signal<boolean>(false);
  readonly cameraZoomPercent = signal<number>(100);

  readonly customConfig = signal<DiceCustomRuntimeConfig>(
    this.loadStoredActiveConfig() ?? createDefaultRuntimeConfigFromSkin(DICE_SKIN_CATALOG[0]),
  );
  readonly activeSkin = computed(() => resolveDiceSkin(this.customConfig().skinId));
  readonly activeModel = computed(() => resolveDiceModel(this.customConfig().modelId));

  readonly savedUserPresets = signal<readonly SavedUserDicePreset[]>(this.loadStoredUserPresets());
  readonly activePresetId = signal<string>('');
  readonly marketplacePresets = signal<readonly MarketplaceDicePreset[]>(buildDefaultMarketplaceDicePresets());

  ngOnInit(): void {
    const presets = this.savedUserPresets();
    if (presets.length > 0 && !this.activePresetId()) this.activePresetId.set(presets[0].id);

    this.http
      .get<{ savedPresets?: SavedUserDicePreset[]; marketplacePresets?: MarketplaceDicePreset[] }>(
        `/api/v2/campaigns/${this.store.activeCampaignId()}/dice-forge/state`,
      )
      .subscribe({
        next: (state) => {
          if (Array.isArray(state.savedPresets) && state.savedPresets.length > 0) {
            this.savedUserPresets.set(state.savedPresets);
            this.persistUserPresetsToStorage(state.savedPresets);
          }
          if (Array.isArray(state.marketplacePresets) && state.marketplacePresets.length > 0) {
            this.marketplacePresets.set(state.marketplacePresets);
          }
        },
        error: () => {},
      });
  }

  ngAfterViewInit(): void {
    const canvas = this.diceStageCanvas?.nativeElement;
    if (!canvas) return;
    this.stageService.mountStage(canvas, this.customConfig().skinId);
    this.stageService.applyCustomOverrides(this.customConfig());
  }

  ngOnDestroy(): void {
    this.stageService.dispose();
  }

  onToolSelected(tool: DiceForgeToolId): void {
    this.activeTool.set(tool);
    this.inspectorOpen.set(true);
  }

  selectSkin(skin: DiceSkinConfig): void {
    const currentName = this.customConfig().customName;
    const nextCfg = this.stageService.applySkin(skin);
    const merged = this.stageService.applyCustomOverrides({
      ...nextCfg,
      customName:
        currentName && !DICE_SKIN_CATALOG.some((s) => s.name === currentName) ? currentName : skin.name,
    });
    this.customConfig.set(merged);
    this.persistActiveConfig(merged);
    this.alertify.notifyStatus(
      '3D Dice Forge',
      'Skin Texture Applied',
      `Applied ${skin.name} (${skin.materialFamily}) texture to active dice.`,
      'emerald',
    );
  }

  onCustomNameChange(newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const updated = this.stageService.applyCustomOverrides({ customName: trimmed });
    this.customConfig.set(updated);
    this.persistActiveConfig(updated);
    this.alertify.notifyStatus(
      '3D Dice Forge',
      'Custom Dice Renamed',
      `Active dice named "${trimmed}". Click Save Set to store under this name.`,
      'emerald',
    );
  }

  applyCustomChange(overrides: Partial<DiceCustomRuntimeConfig>): void {
    const updated = this.stageService.applyCustomOverrides(overrides);
    this.customConfig.set(updated);
    this.persistActiveConfig(updated);
  }

  applyPhysicsChange(physicsPatch: Partial<DicePhysicsConfig>): void {
    const mergedPhysics: DicePhysicsConfig = { ...this.customConfig().physics, ...physicsPatch };
    const updated = this.stageService.applyCustomOverrides({ physics: mergedPhysics });
    this.customConfig.set(updated);
    this.persistActiveConfig(updated);
  }

  resetCustomToSkinDefaults(): void {
    const skin = this.activeSkin();
    const fresh = this.stageService.applySkin(skin);
    this.customConfig.set(fresh);
    this.persistActiveConfig(fresh);
    this.alertify.notifyStatus(
      '3D Dice Forge',
      'Reset to Skin Defaults',
      `Restored all pigments, glows, typography, and physics to ${skin.name} defaults.`,
      'gold',
    );
  }

  setFocusDie(focus: DicePolyhedronType | 'all'): void {
    this.focusDie.set(focus);
    this.stageService.setShowcaseFocusDie(focus);
  }

  returnToStationaryShowcase(): void {
    this.stageService.clearRollAndReturnToShowcase();
    this.alertify.notifyStatus(
      '3D Dice Forge',
      'Stationary Showcase',
      'Returned dice to stationary 360-degree inspection mode.',
      'emerald',
      3200,
    );
  }

  zoomStageCamera(deltaRadius: number): void {
    this.stageService.zoomCamera(deltaRadius);
    this.cameraZoomPercent.update((pct) => Math.max(45, Math.min(220, Math.round(pct - deltaRadius * 8))));
  }

  resetStageCamera(): void {
    this.stageService.resetCameraToShowcase();
    this.cameraZoomPercent.set(100);
  }

  previewRollCameraView(): void {
    this.stageService.applyRollCameraView();
    this.alertify.notifyStatus(
      '3D Dice Forge',
      'Roll Camera Angle',
      `Previewing ${this.customConfig().physics.rollCameraPitchDeg}° top-down game throw camera.`,
      'emerald',
      3200,
    );
  }

  toggleBoundaryWireframe(): void {
    this.applyPhysicsChange({ showBoundaryBox: !this.customConfig().physics.showBoundaryBox });
  }

  previewCritEffect(kind: 'nat20' | 'critfail'): void {
    this.stageService.previewCritOutcomeEffect(kind);
    this.alertify.notifyStatus(
      '3D Dice Forge',
      kind === 'nat20' ? 'Nat 20 Shader Preview' : 'Crit Fail Shader Preview',
      kind === 'nat20'
        ? `Triggered ${this.customConfig().nat20EffectId} critical burst.`
        : `Triggered ${this.customConfig().critFailEffectId} critical fail fracture.`,
      kind === 'nat20' ? 'gold' : 'crimson',
      3600,
    );
  }

  testRollSound(profileId: string): void {
    this.soundService.playRollStartClatter(profileId, 2);
    this.alertify.notifyStatus('3D Dice Forge', 'Acoustic Profile Test', `Played sample clatter for ${profileId}.`, 'emerald', 3000);
  }

  saveCurrentPreset(asNew: boolean): void {
    const baseCfg = structuredClone(this.customConfig());
    const name = (baseCfg.customName || this.activeSkin().name).trim();
    const existingList = [...this.savedUserPresets()];
    const existingIdx = existingList.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    const presetId = !asNew && existingIdx >= 0 ? existingList[existingIdx].id : `user-dice-${Date.now()}`;
    const finalName = asNew && existingIdx >= 0 ? `${name} (${existingList.length + 1})` : name;
    const cfg: DiceCustomRuntimeConfig = { ...baseCfg, customName: finalName };

    const savedPreset: SavedUserDicePreset = {
      id: presetId,
      name: finalName,
      ownerUsername: this.auth.activeProfile().displayName || 'Weaver',
      updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isPublishedToMarket: false,
      config: cfg,
    };

    const nextList =
      !asNew && existingIdx >= 0
        ? existingList.map((item, idx) => (idx === existingIdx ? savedPreset : item))
        : [savedPreset, ...existingList];

    this.savedUserPresets.set(nextList);
    this.activePresetId.set(savedPreset.id);
    this.customConfig.set(cfg);
    this.persistUserPresetsToStorage(nextList);
    this.persistActiveConfig(cfg);
    this.http.post(`/api/v2/campaigns/${this.store.activeCampaignId()}/dice-forge/presets`, savedPreset).subscribe({ error: () => {} });

    this.alertify.notifyStatus(
      '3D Dice Forge',
      asNew ? 'Saved New Custom Dice' : 'Custom Dice Saved',
      `Saved "${finalName}" to your personal dice presets.`,
      'emerald',
    );
  }

  loadSavedPreset(preset: SavedUserDicePreset): void {
    const cfg = structuredClone(preset.config);
    this.activePresetId.set(preset.id);
    this.stageService.applySkin(resolveDiceSkin(cfg.skinId));
    const applied = this.stageService.applyCustomOverrides(cfg);
    this.customConfig.set(applied);
    this.persistActiveConfig(applied);
    this.alertify.notifyStatus('3D Dice Forge', 'Loaded Custom Dice', `Equipped "${preset.name}" onto the 3D forge stage.`, 'emerald');
  }

  deleteSavedPreset(presetId: string): void {
    const target = this.savedUserPresets().find((p) => p.id === presetId);
    const nextList = this.savedUserPresets().filter((p) => p.id !== presetId);
    this.savedUserPresets.set(nextList);
    this.persistUserPresetsToStorage(nextList);
    if (this.activePresetId() === presetId) this.activePresetId.set(nextList[0]?.id ?? '');
    this.http.delete(`/api/v2/campaigns/${this.store.activeCampaignId()}/dice-forge/presets/${presetId}`).subscribe({ error: () => {} });
    this.alertify.notifyStatus('3D Dice Forge', 'Preset Removed', `Deleted "${target?.name ?? 'Custom Dice'}" from saved presets.`, 'crimson', 4000);
  }

  publishCurrentToMarketplace(taglineInput?: string): void {
    const cfg = structuredClone(this.customConfig());
    const creator = this.auth.activeProfile().displayName || 'Weaver Architect';
    const marketEntry: MarketplaceDicePreset = {
      id: `mkt-dice-${Date.now()}`,
      name: cfg.customName || this.activeSkin().name,
      creatorHandle: creator,
      tagline:
        taglineInput?.trim() ||
        `${this.activeSkin().materialFamily} custom forge set on ${this.activeModel().name} with tuned physics & glow shaders.`,
      downloadsCount: 1,
      rating: 5.0,
      publishedAt: 'Just now',
      config: cfg,
    };

    this.marketplacePresets.update((list) => [marketEntry, ...list]);
    this.http.post('/api/v2/marketplace/dice-presets', marketEntry).subscribe({ error: () => {} });
    this.alertify.notifyStatus(
      'Creator Marketplace',
      'Dice Published to Market',
      `Published "${marketEntry.name}" by ${creator} so other players and GMs can import it.`,
      'gold',
    );
  }

  importFromMarketplace(marketPreset: MarketplaceDicePreset): void {
    const importedCfg: DiceCustomRuntimeConfig = { ...structuredClone(marketPreset.config), customName: marketPreset.name };
    const savedPreset: SavedUserDicePreset = {
      id: `user-imported-${Date.now()}`,
      name: marketPreset.name,
      ownerUsername: marketPreset.creatorHandle,
      updatedAt: 'Imported',
      isPublishedToMarket: true,
      config: importedCfg,
    };
    const nextList = [savedPreset, ...this.savedUserPresets()];
    this.savedUserPresets.set(nextList);
    this.activePresetId.set(savedPreset.id);
    this.persistUserPresetsToStorage(nextList);
    this.stageService.applySkin(resolveDiceSkin(importedCfg.skinId));
    const applied = this.stageService.applyCustomOverrides(importedCfg);
    this.customConfig.set(applied);
    this.persistActiveConfig(applied);
    this.marketModalOpen.set(false);
    this.alertify.notifyStatus(
      'Creator Marketplace',
      'Dice Imported & Equipped',
      `Imported "${marketPreset.name}" by ${marketPreset.creatorHandle} into your saved presets.`,
      'gold',
    );
  }

  executePoolRoll(req: DicePoolRollRequest): void {
    const entries: { dieType: DicePolyhedronType; value: number }[] = [];
    for (const grp of req.pool) {
      const count = grp.dieType === 'd20' && grp.count === 1 && req.rollMode !== 'normal' ? 2 : grp.count;
      for (let i = 0; i < count && entries.length < 20; i++) {
        entries.push({ dieType: grp.dieType, value: Math.floor(Math.random() * grp.sides) + 1 });
      }
    }
    if (entries.length === 0) return;

    const rawRolls = entries.map((e) => e.value);
    const total =
      entries.length === 2 && req.pool.length === 1 && req.pool[0].dieType === 'd20' && req.rollMode !== 'normal'
        ? req.rollMode === 'advantage'
          ? Math.max(rawRolls[0], rawRolls[1])
          : Math.min(rawRolls[0], rawRolls[1])
        : rawRolls.reduce((sum, n) => sum + n, 0);
    const isNat20 = entries.some((e) => e.dieType === 'd20' && e.value === 20);
    const isCritFail = entries.some((e) => e.dieType === 'd20' && e.value === 1);
    const formula = req.pool.map((p) => `${p.count}${p.dieType}`).join(' + ');

    this.stageService.animatePoolRoll(entries, isNat20, isCritFail);

    const cfg = this.customConfig();
    this.http
      .post(`/api/v2/campaigns/${this.store.activeCampaignId()}/dice/roll`, {
        sides: req.pool[0]?.sides ?? 20,
        count: entries.length,
        modifier: 0,
        rollMode: req.rollMode,
        label: req.isRandomQuickRoll ? `Quick Random Roll (${entries.length} Dice)` : `${cfg.customName} Roll`,
        skinId: cfg.skinId,
        modelId: cfg.modelId,
        sizePreset: cfg.sizePreset,
        nat20EffectId: cfg.nat20EffectId,
        critFailEffectId: cfg.critFailEffectId,
        soundProfileId: cfg.soundProfileId,
      })
      .subscribe({ error: () => {} });

    this.alertify.notifyRoll({
      whoRolled: cfg.customName || this.activeSkin().name,
      rollType: req.isRandomQuickRoll
        ? `Random Throw (${entries.length} Dice)`
        : req.rollMode === 'advantage'
          ? 'Advantage Throw'
          : req.rollMode === 'disadvantage'
            ? 'Disadvantage Throw'
            : '3D Dice Forge Throw',
      formula,
      naturalDie: rawRolls[0] ?? total,
      rawRolls,
      modifier: 0,
      modifiersBreakdown: `${this.activeModel().name} · ${this.activeSkin().name}`,
      adjustedTotal: total,
      isNat20,
      isCritFail,
      outcomeSubtext: `Breakdown: ${entries.map((e) => `${e.dieType}(${e.value})`).join(' + ')}`,
    });
  }

  triggerQuickRandomRollUpTo5(): void {
    const options: { dieType: DicePolyhedronType; sides: number }[] = [
      { dieType: 'd4', sides: 4 }, { dieType: 'd6', sides: 6 }, { dieType: 'd8', sides: 8 },
      { dieType: 'd10', sides: 10 }, { dieType: 'd12', sides: 12 }, { dieType: 'd20', sides: 20 }, { dieType: 'd100', sides: 100 },
    ];
    const totalDice = Math.floor(Math.random() * 5) + 1; // 1..5 random dice, never exceeds 5
    const bucket = new Map<DicePolyhedronType, { dieType: DicePolyhedronType; sides: number; count: number }>();
    for (let i = 0; i < totalDice; i++) {
      const pick = options[Math.floor(Math.random() * options.length)];
      const cur = bucket.get(pick.dieType);
      if (cur) cur.count += 1;
      else bucket.set(pick.dieType, { ...pick, count: 1 });
    }
    this.executePoolRoll({ pool: Array.from(bucket.values()), rollMode: 'normal', isRandomQuickRoll: true });
  }

  private loadStoredUserPresets(): SavedUserDicePreset[] {
    if (typeof window === 'undefined') return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(USER_PRESETS_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private persistUserPresetsToStorage(presets: readonly SavedUserDicePreset[]): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(USER_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch {}
  }

  private loadStoredActiveConfig(): DiceCustomRuntimeConfig | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<DiceCustomRuntimeConfig>;
      const base = createDefaultRuntimeConfigFromSkin(resolveDiceSkin(parsed.skinId || DICE_SKIN_CATALOG[0].id));
      return { ...base, ...parsed, physics: { ...DEFAULT_DICE_PHYSICS_CONFIG, ...(parsed.physics ?? {}) } };
    } catch {
      return null;
    }
  }

  private persistActiveConfig(cfg: DiceCustomRuntimeConfig): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ACTIVE_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    } catch {}
  }
}
