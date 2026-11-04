import { CommonModule } from '@angular/common';
import { Component, computed, inject, output, signal } from '@angular/core';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import {
  DND_TOKEN_SIZE_CATEGORIES,
  DndTokenSizeCategory,
  VttConditionKey,
  VttTokenLightPreset,
  VttTokenVm,
  getTokenRimColorHex,
} from '../../../effects/engine/effect-timeline.contract';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';
import { VttCombatService } from '../../services/vtt-combat.service';

export type TokenContextTab = 'quick' | 'light' | 'glow';

export interface LightPresetOption {
  readonly id: VttTokenLightPreset;
  readonly label: string;
  readonly sublabel: string;
  readonly colorHex: string;
}

@Component({
  selector: 'lw-vtt-token-context-menu',
  standalone: true,
  imports: [CommonModule, LwIconComponent],
  templateUrl: './vtt-token-context-menu.component.html',
  styleUrl: './vtt-token-context-menu.component.scss',
})
export class VttTokenContextMenuComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly vtt = inject(VttCombatService);
  readonly battle = inject(VttBattleStateService);

  readonly openCharacterSheet = output<string>();

  readonly activeTab = signal<TokenContextTab>('quick');
  readonly sizeCategories = DND_TOKEN_SIZE_CATEGORIES;

  readonly lightPresets: readonly LightPresetOption[] = [
    { id: 'none', label: 'Extinguish', sublabel: 'No emitted light', colorHex: '#64748b' },
    { id: 'torch', label: 'Torch', sublabel: '20ft Bright / 40ft Dim', colorHex: '#ff9922' },
    { id: 'lantern-hooded', label: 'Hooded Lantern', sublabel: '30ft Bright / 60ft Dim', colorHex: '#ffc838' },
    { id: 'lantern-bullseye', label: 'Bullseye Lantern', sublabel: '60ft Bright / 120ft Dim', colorHex: '#ffe066' },
    { id: 'candle', label: 'Candle', sublabel: '5ft Bright / 10ft Dim', colorHex: '#ffae42' },
    { id: 'spell-light', label: 'Light Cantrip', sublabel: '20ft Bright / 40ft Dim', colorHex: '#49e892' },
    { id: 'daylight', label: 'Daylight Spell', sublabel: '60ft Bright / 120ft Dim', colorHex: '#fff6d6' },
  ];

  readonly conditionOptions: readonly { key: VttConditionKey; label: string }[] = [
    { key: 'prone', label: 'Prone' },
    { key: 'concentrating', label: 'Concentrating' },
    { key: 'blessed', label: 'Blessed' },
    { key: 'hasted', label: 'Hasted' },
    { key: 'shielded', label: 'Shielded' },
    { key: 'poisoned', label: 'Poisoned' },
    { key: 'invisible', label: 'Invisible' },
  ];

  readonly colorSwatches: readonly string[] = [
    '#2ee66b',
    '#49e892',
    '#d9b77a',
    '#ff9922',
    '#38bdf8',
    '#a855f7',
    '#ef5d72',
    '#f4efe2',
  ];

  readonly menuState = computed(() => this.battle.tokenContextMenu());

  readonly token = computed<VttTokenVm | null>(() => {
    const state = this.menuState();
    if (!state) return null;
    return this.vtt.tokens().find((t) => t.key === state.tokenKey) ?? null;
  });

  readonly canEditToken = computed<boolean>(() => {
    const t = this.token();
    if (!t) return false;
    return this.battle.canControlToken(t);
  });

  readonly menuPositionStyle = computed(() => {
    const state = this.menuState();
    if (!state) return { left: '0px', top: '0px' };
    const maxW = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const maxH = typeof window !== 'undefined' ? window.innerHeight : 900;
    const x = Math.max(16, Math.min(maxW - 350, state.clientX + 8));
    const y = Math.max(56, Math.min(maxH - 470, state.clientY - 20));
    return { left: `${x}px`, top: `${y}px` };
  });

  readonly isPreviewingThisTokenEyes = computed<boolean>(() => {
    const t = this.token();
    return !!t && this.battle.previewTokenVisionKey() === t.key;
  });

  selectAsActor(token: VttTokenVm): void {
    this.vtt.selectedAttackerKey.set(token.key);
  }

  toggleTarget(token: VttTokenVm): void {
    const targeted = this.battle.isTokenTargetedWithReticle(token.key);
    if (targeted) {
      this.battle.multiTargetKeys.update((keys) => keys.filter((k) => k !== token.key));
      this.battle.queuedTargetSequence.update((keys) => keys.filter((k) => k !== token.key));
    } else {
      this.battle.multiTargetKeys.update((keys) => [...keys, token.key]);
      this.vtt.selectedTargetKey.set(token.key);
    }
  }

  toggleViewThroughEyes(token: VttTokenVm): void {
    const current = this.battle.previewTokenVisionKey();
    this.battle.previewTokenVisionKey.set(current === token.key ? null : token.key);
  }

  adjustHp(token: VttTokenVm, delta: number): void {
    if (!this.canEditToken()) return;
    this.vtt.adjustTokenHp(token.key, delta);
  }

  fullHeal(token: VttTokenVm): void {
    if (!this.canEditToken()) return;
    const missing = Math.max(0, token.maxHp - token.currentHp);
    if (missing > 0) this.vtt.adjustTokenHp(token.key, missing);
  }

  setSize(token: VttTokenVm, size: DndTokenSizeCategory): void {
    if (!this.canEditToken()) return;
    this.vtt.setTokenSizeCategory(token.key, size);
  }

  hasCondition(token: VttTokenVm, cond: VttConditionKey): boolean {
    return (token.conditions ?? []).includes(cond);
  }

  toggleCondition(token: VttTokenVm, cond: VttConditionKey): void {
    if (!this.canEditToken()) return;
    this.vtt.toggleTokenCondition(token.key, cond);
  }

  applyLightPreset(token: VttTokenVm, preset: VttTokenLightPreset): void {
    if (!this.canEditToken()) return;
    this.vtt.setTokenLightPreset(token.key, preset);
  }

  setLightColor(token: VttTokenVm, colorHex: string): void {
    if (!this.canEditToken()) return;
    this.vtt.setTokenLightPreset(token.key, token.lightPreset ?? 'torch', colorHex);
  }

  setVisionPreset(token: VttTokenVm, sightFeet: number, darkvisionFeet: number): void {
    if (!this.canEditToken()) return;
    this.vtt.setTokenVision(token.key, sightFeet, darkvisionFeet);
  }

  toggleAmbientGlow(token: VttTokenVm): void {
    if (!this.canEditToken()) return;
    const next = token.ambientGlowEnabled === false;
    this.vtt.updateTokenAppearance(token.key, {
      ambientGlowEnabled: next,
      ambientGlowColorHex: token.ambientGlowColorHex || getTokenRimColorHex(token),
      ambientGlowIntensity: token.ambientGlowIntensity ?? 0.65,
      ambientGlowRadiusFeet: token.ambientGlowRadiusFeet ?? 10,
    });
  }

  setAmbientGlowColor(token: VttTokenVm, colorHex: string): void {
    if (!this.canEditToken()) return;
    this.vtt.updateTokenAppearance(token.key, {
      ambientGlowEnabled: true,
      ambientGlowColorHex: colorHex,
    });
  }

  setAmbientGlowIntensity(token: VttTokenVm, rawPercent: string): void {
    if (!this.canEditToken()) return;
    const pct = Math.max(15, Math.min(100, Number(rawPercent) || 65));
    this.vtt.updateTokenAppearance(token.key, {
      ambientGlowEnabled: true,
      ambientGlowIntensity: Number((pct / 100).toFixed(2)),
    });
  }

  setAmbientGlowRadius(token: VttTokenVm, rawFeet: string): void {
    if (!this.canEditToken()) return;
    const feet = Math.max(5, Math.min(30, Number(rawFeet) || 10));
    this.vtt.updateTokenAppearance(token.key, {
      ambientGlowEnabled: true,
      ambientGlowRadiusFeet: feet,
    });
  }

  setTokenRingColor(token: VttTokenVm, colorHex: string): void {
    if (!this.canEditToken()) return;
    this.vtt.updateTokenAppearance(token.key, { colorHex, colorOverride: colorHex });
  }

  removeToken(token: VttTokenVm): void {
    if (this.store.viewerRole() !== 'gm') return;
    this.vtt.removeTokenFromVtt(token.key);
    this.battle.closeTokenContextMenu();
  }
}
