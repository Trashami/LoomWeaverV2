import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../../../../shared/ui/public-api';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { VttTacticalAbilityVm, VttTurnActionCategory } from '../../models/vtt-battle.models';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';
import { VttCombatService } from '../../services/vtt-combat.service';
import { NgTemplateOutlet } from '@angular/common';
import {
  ART_ACTION_BAR_SKINS,
  ActionBarSkinId,
  DEFAULT_ACTION_BAR_SKIN,
  LOOM_RAVEN_SKIN_IMAGE,
} from './action-bar-skins';

interface CategoryTab {
  readonly id: VttTurnActionCategory;
  readonly label: string;
}

@Component({
  selector: 'lw-vtt-action-bar',
  standalone: true,
  imports: [NgpButton, LwIconComponent, NgTemplateOutlet],
  templateUrl: './vtt-action-bar.component.html',
  styleUrls: ['./vtt-action-bar.component.scss', './vtt-action-bar-art.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-skin]': 'skin()',
    '[class.is-compact]': 'compact()',
    '[class.is-art]': 'isArt()',
    '[style.opacity]': 'opacity() / 100',
  },
})
export class VttActionBarComponent {
  protected readonly battle = inject(VttBattleStateService);
  protected readonly vtt = inject(VttCombatService);
  protected readonly store = inject(LoomWeaverStoreService);

  readonly skin = input<ActionBarSkinId>(DEFAULT_ACTION_BAR_SKIN);
  readonly compact = input(false);
  readonly opacity = input(95);
  readonly showKeys = input(true);

  readonly abilitySelected = output<VttTacticalAbilityVm>();
  readonly endTurn = output<void>();
  readonly settingsRequested = output<void>();

  protected readonly tabs: readonly CategoryTab[] = [
    { id: 'all', label: 'All' },
    { id: 'melee', label: 'Melee' },
    { id: 'ranged', label: 'Ranged' },
    { id: 'spell', label: 'Spells' },
    { id: 'bonus', label: 'Bonus' },
    { id: 'reaction', label: 'Reaction' },
    { id: 'free', label: 'Free' },
  ];

  protected readonly skinImage = LOOM_RAVEN_SKIN_IMAGE;
  protected readonly isArt = computed(() => ART_ACTION_BAR_SKINS.includes(this.skin()));
  /** The artwork frame has a fixed 14 x 3 slot grid. */
  protected readonly artAbilities = computed(() => this.battle.filteredTurnAbilities().slice(0, 42));
  protected readonly categoryShort: Readonly<Record<string, string>> = {
    all: 'All', melee: 'Mel', ranged: 'Rng', spell: 'Spl', bonus: 'Bon', reaction: 'Rea', free: 'Free',
  };

  protected readonly hero = this.battle.activeObserverToken;
  protected readonly isActiveTurn = computed(
    () => this.battle.activeInitiativeToken()?.key === this.hero().key,
  );
  protected readonly hpPercent = computed(() => {
    const t = this.hero();
    return t.maxHp > 0 ? Math.max(0, Math.min(100, (t.currentHp / t.maxHp) * 100)) : 0;
  });

  protected glyph(name: string): string {
    const words = name.split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  }

  protected costKind(ability: VttTacticalAbilityVm): 'action' | 'bonus' | 'reaction' | 'free' {
    switch (ability.actionCost) {
      case '1 Bonus Action': return 'bonus';
      case '1 Reaction': return 'reaction';
      case 'Free Action': return 'free';
      default: return 'action';
    }
  }

  protected targetLabel(ability: VttTacticalAbilityVm): string {
    if (!this.battle.isSingleOrMultiTargetAbility(ability)) return `${ability.aoeRadiusFeet}ft AoE`;
    return ability.maxTargets > 1 ? `${ability.maxTargets} targets` : '1 target';
  }
}
