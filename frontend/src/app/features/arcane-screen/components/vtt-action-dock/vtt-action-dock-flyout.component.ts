import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LwIconComponent } from '../../../../shared/ui/public-api';
import {
  DockAction,
  DockActionTab,
  DockSave,
  DockSkill,
  DockStandardAction,
  DockToken,
} from './vtt-action-dock.models';
import { SpellLevelGroup, SpellTags } from './vtt-action-dock.spells';

@Component({
  selector: 'lw-vtt-action-dock-flyout',
  standalone: true,
  imports: [LwIconComponent],
  templateUrl: './vtt-action-dock-flyout.component.html',
  styleUrls: ['./vtt-action-dock-flyout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'dock-flyout-host' },
})
export class VttActionDockFlyoutComponent {
  readonly token = input.required<DockToken>();
  readonly activeTab = input.required<DockActionTab>();
  readonly tabs = input<readonly DockActionTab[]>([]);
  readonly search = input<string>('');
  readonly weapons = input<readonly DockAction[]>([]);
  readonly spellGroups = input<readonly SpellLevelGroup[]>([]);
  readonly spellCount = input<number>(0);
  readonly standardActions = input<readonly DockStandardAction[]>([]);
  readonly skills = input<readonly DockSkill[]>([]);
  readonly saves = input<readonly DockSave[]>([]);
  readonly conditions = input<readonly string[]>([]);
  readonly pendingActionId = input<string | null>(null);
  readonly hasCondition = input<(token: DockToken, condition: string) => boolean>(() => false);
  readonly spellIcon = input<(action: DockAction) => string>(() => 'auto_stories');
  readonly spellTags = input<(action: DockAction) => SpellTags>(() => ({ vsm: '', concentration: false, ritual: false }));

  readonly close = output<void>();
  readonly tabChange = output<DockActionTab>();
  readonly searchChange = output<string>();
  readonly chooseAction = output<DockAction>();
  readonly standardAction = output<{ action: DockStandardAction; token: DockToken }>();
  readonly skillCheck = output<{ skill: DockSkill; token: DockToken }>();
  readonly saveCheck = output<{ save: DockSave; token: DockToken }>();
  readonly toggleCondition = output<{ tokenId: number; condition: string }>();
  readonly openSheet = output<DockToken>();
  readonly editToken = output<DockToken>();

  onSearch(event: Event): void {
    this.searchChange.emit((event.target as HTMLInputElement).value);
  }
}
