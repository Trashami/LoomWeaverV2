import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { LwIconComponent } from '../../../../shared/ui/public-api';
import {
  ActionDockSkin,
  DEFAULT_ACTION_DOCK_SKIN,
  DOCK_ABILITIES,
  DOCK_ACTION_TABS,
  DOCK_CONDITIONS,
  DOCK_SAVES,
  DOCK_SKILLS,
  DOCK_STANDARD_ACTIONS,
  DockAction,
  DockActionCategory,
  DockActionTab,
  DockOnlineUser,
  DockSave,
  DockSkill,
  DockStandardAction,
  DockToken,
} from './vtt-action-dock.models';
import { getSpellIcon, getSpellTags, groupSpellsByLevel } from './vtt-action-dock.spells';
import { VttActionDockFlyoutComponent } from './vtt-action-dock-flyout.component';

@Component({
  selector: 'lw-vtt-action-dock',
  standalone: true,
  imports: [LwIconComponent, VttActionDockFlyoutComponent],
  templateUrl: './vtt-action-dock.component.html',
  styleUrls: ['./vtt-action-dock.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-skin]': 'skin()',
  },
})
export class VttActionDockComponent {
  // Token and turn state
  readonly activeDisplayToken = input<DockToken | null>(null);
  readonly activeInitiativeTokenId = input<number | null>(null);
  readonly turnActionUsed = input<boolean>(false);
  readonly turnBonusActionUsed = input<boolean>(false);
  readonly turnReactionUsed = input<boolean>(false);
  readonly turnMovementRemainingFeet = input<number>(30);
  readonly turnMovementMaxFeet = input<number>(30);
  readonly canEndTurn = input<boolean>(false);
  readonly isGm = input<boolean>(false);
  readonly isMeasuring = input<boolean>(false);
  readonly focusMode = input<boolean>(false);
  readonly zoom = input<number>(100);
  readonly actionMessage = input<string | null>(null);
  readonly isTestingAction = input<boolean>(false);
  readonly pendingAction = input<string | null>(null);
  readonly selectedAction = input<DockAction | null>(null);
  readonly campaignOnlineUsers = input<readonly DockOnlineUser[]>([]);
  readonly chatLogStationCollapsed = input<boolean>(true);
  readonly currentUserId = input<number | null | undefined>(null);
  readonly currentUserName = input<string>('You');
  readonly tokenActions = input<readonly DockAction[]>([]);
  readonly skin = input<ActionDockSkin>(DEFAULT_ACTION_DOCK_SKIN);

  // Lookup callbacks supplied by the parent
  readonly getTokenHp = input<(token: DockToken) => number>((t) => t.hp ?? t.maxHp ?? 10);
  readonly getTokenAc = input<(token: DockToken) => number>((t) => t.armorClass ?? 10);
  readonly getAssignedTokenForUser = input<(user: DockOnlineUser) => DockToken | null>(() => null);
  readonly hasTokenCondition = input<(token: DockToken, condition: string) => boolean>(() => false);
  readonly getMeleeAttacks = input<(token: DockToken) => readonly DockAction[]>(() => []);
  readonly getRangedAttacks = input<(token: DockToken) => readonly DockAction[]>(() => []);
  readonly getSpells = input<(token: DockToken) => readonly DockAction[]>(() => []);
  readonly getBonusActions = input<(token: DockToken) => readonly DockAction[]>(() => []);
  readonly getReactions = input<(token: DockToken) => readonly DockAction[]>(() => []);

  // Outputs
  readonly openSheet = output<DockToken>();
  readonly endTurn = output<void>();
  readonly toggleMeasure = output<void>();
  readonly toggleFocus = output<void>();
  readonly changeZoom = output<number>();
  readonly resetZoom = output<void>();
  readonly menuActionSelect = output<{ action: DockAction; token: DockToken }>();
  readonly abilityCheck = output<{ token: DockToken; stat: string }>();
  readonly savingThrow = output<{ token: DockToken; stat: string }>();
  readonly standardAction = output<{ action: DockStandardAction; token: DockToken }>();
  readonly skillCheck = output<{ skill: DockSkill; token: DockToken }>();
  readonly saveCheck = output<{ save: DockSave; token: DockToken }>();
  readonly startMovementTest = output<DockToken>();
  readonly startActionTest = output<{ action: DockAction; token: DockToken }>();
  readonly endActionTest = output<void>();
  readonly cancelPendingAction = output<void>();
  readonly chooseAction = output<DockAction>();
  readonly toggleCondition = output<{ tokenId: number; condition: string }>();
  readonly editToken = output<DockToken>();

  // Internal UI state
  readonly bottomConsoleCollapsed = signal<boolean>(false);
  readonly activeActionCategoryPopover = signal<DockActionCategory | null>(null);
  readonly showConnectedRoster = signal<boolean>(false);
  readonly showActionTestMenu = signal<boolean>(false);
  readonly actionMenuOpen = signal<boolean>(false);
  readonly activeActionTab = signal<DockActionTab>('Attacks');
  readonly actionSearch = signal<string>('');

  readonly standardActions = DOCK_STANDARD_ACTIONS;
  readonly standardSkills = DOCK_SKILLS;
  readonly standardSaves = DOCK_SAVES;
  readonly allConditions = DOCK_CONDITIONS;
  readonly abilities = DOCK_ABILITIES;
  readonly actionTabs = DOCK_ACTION_TABS;
  protected readonly spellIcon = getSpellIcon;
  protected readonly spellTags = getSpellTags;

  readonly onlineCount = computed(() => this.campaignOnlineUsers().length || 1);
  readonly filteredWeapons = computed(() => this.filterActions('weapon'));
  readonly filteredSpells = computed(() => this.filterActions('spell'));
  readonly spellGroups = computed(() => groupSpellsByLevel(this.filteredSpells()));

  toggleBottomConsole(): void {
    this.bottomConsoleCollapsed.update((v) => !v);
  }

  toggleActionCategory(category: DockActionCategory): void {
    this.activeActionCategoryPopover.update((current) => (current === category ? null : category));
  }

  closeCategoryPopover(): void {
    this.activeActionCategoryPopover.set(null);
  }

  toggleActionTestMenu(): void {
    this.showActionTestMenu.update((v) => !v);
  }

  toggleActionMenu(): void {
    this.actionMenuOpen.update((v) => !v);
  }

  toggleConnectedRoster(): void {
    this.showConnectedRoster.update((v) => !v);
  }

  setActionTab(tab: DockActionTab): void {
    this.activeActionTab.set(tab);
  }

  chooseFromFlyout(action: DockAction): void {
    this.chooseAction.emit(action);
    this.actionMenuOpen.set(false);
  }

  onActionSearch(query: string): void {
    this.actionSearch.set(query);
  }

  hpPercent(token: DockToken): number {
    const hp = token.hp ?? 30;
    const max = token.maxHp || token.hp || 30;
    return Math.min(100, Math.max(0, (hp / max) * 100));
  }

  isHpLow(token: DockToken): boolean {
    return (token.hp ?? 30) <= (token.maxHp || 30) * 0.3;
  }

  onImageError(event: Event): void {
    (event.target as HTMLElement).style.display = 'none';
  }

  private filterActions(kind: DockAction['kind']): readonly DockAction[] {
    const query = this.actionSearch().toLowerCase().trim();
    const list = this.tokenActions().filter((action) => action.kind === kind);
    if (!query) return list;
    return list.filter((action) =>
      action.name.toLowerCase().includes(query) ||
      (!!action.damageType && action.damageType.toLowerCase().includes(query)) ||
      (!!action.damageFormula && action.damageFormula.toLowerCase().includes(query))
    );
  }
}
