import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { NgpToolbar } from 'ng-primitives/toolbar';
import { CampaignSessionVm, CampaignVm, ViewerRole } from '../../../core/models/loomweaver.models';
import { LoomWeaverStoreService, LwExperienceMode } from '../../../core/services/loomweaver-store.service';
import {
  LwContextSwitcherAction,
  LwContextSwitcherComponent,
  LwContextSwitcherOption,
} from '../context-switcher/context-switcher.component';
import { LwIconComponent } from '../icon/icon.component';
import { LwNotificationBellComponent } from '../notification-bell/notification-bell.component';
import { LwUserMenuComponent } from '../user-menu/user-menu.component';

@Component({
  selector: 'lw-app-header-bar',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NgpButton,
    NgpToolbar,
    LwContextSwitcherComponent,
    LwIconComponent,
    LwNotificationBellComponent,
    LwUserMenuComponent,
  ],
  templateUrl: './app-header-bar.component.html',
  styleUrl: './app-header-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwAppHeaderBarComponent {
  readonly store = inject(LoomWeaverStoreService, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly variant = input<'studio' | 'public'>('studio');
  readonly campaigns = input<readonly CampaignVm[]>([]);
  readonly activeCampaign = input<CampaignVm | null>(null);
  readonly activeCampaignId = input<number>(0);
  readonly viewerRole = input<ViewerRole>('gm');
  readonly isCampaignGm = input<boolean>(true);
  readonly audioPlaying = input<boolean>(false);
  readonly quickRollBanner = input<string>('1d20 Ready');
  readonly loomOpen = input<boolean>(false);
  readonly userDisplayName = input<string>('Dungeon Master');
  readonly userEmail = input<string>('gm@loom-weaver.com');
  readonly userTierCode = input<string>('weaver');
  readonly generativeAiEnabled = input<boolean>(false);
  readonly hideAiContent = input<boolean>(true);
  readonly experienceMode = input<LwExperienceMode>('advanced');
  readonly navCollapsed = input<boolean>(false);
  readonly collapseIcon = input<'apps' | 'menu'>('apps');

  // Component dimension properties (width/height + min/max)
  readonly width = input<string>('100%');
  readonly minWidth = input<string>('0');
  readonly maxWidth = input<string>('100%');
  readonly height = input<string>('auto');
  readonly minHeight = input<string>('62px');
  readonly maxHeight = input<string>('none');

  // Logo customization properties
  readonly logoSrc = input<string>('/landing-assets/brand/logo-wordmark.png');
  readonly logoAlt = input<string>('LoomWeaver Crest');
  readonly logoShowBorder = input<boolean>(false);
  readonly logoBorder = input<string>('none');
  readonly logoWidth = input<string>('136px');
  readonly logoMinWidth = input<string>('112px');
  readonly logoMaxWidth = input<string>('180px');
  readonly logoHeight = input<string>('42px');
  readonly logoMinHeight = input<string>('32px');
  readonly logoMaxHeight = input<string>('54px');

  readonly searchText = model<string>('');

  readonly navToggleRequested = output<void>();
  readonly campaignSelected = output<number>();
  readonly searchSubmitted = output<string>();
  readonly audioToggled = output<void>();
  readonly quickRollRequested = output<void>();
  readonly viewerRoleToggled = output<void>();
  readonly loomToggled = output<void>();
  readonly generativeAiToggled = output<boolean>();
  readonly hideAiContentToggled = output<boolean>();
  readonly experienceModeChanged = output<LwExperienceMode>();
  readonly syncProfileRequested = output<void>();
  readonly logoutRequested = output<void>();

  readonly campaignDropdownOpen = signal<boolean>(false);
  readonly sessionDropdownOpen = signal<boolean>(false);

  readonly resolvedCampaigns = computed<readonly CampaignVm[]>(() => {
    const inputList = this.campaigns();
    const storeList = this.store?.campaigns() ?? [];
    return inputList.length > 0 ? inputList : storeList;
  });

  readonly resolvedSessions = computed<readonly CampaignSessionVm[]>(() => {
    return this.store?.sessions() ?? [];
  });

  readonly campaignCountLabel = computed<string>(() => {
    const count = this.resolvedCampaigns().length;
    return `${count} Campaign${count === 1 ? '' : 's'}`;
  });

  readonly sessionCountLabel = computed<string>(() => {
    const count = this.resolvedSessions().length;
    return `${count} Session${count === 1 ? '' : 's'}`;
  });

  readonly campaignSwitcherOptions = computed<readonly LwContextSwitcherOption[]>(() => {
    const activeId = this.activeCampaignId() || this.store?.activeCampaignId() || 0;
    return this.resolvedCampaigns().map((camp) => {
      const active = camp.id === activeId;
      const roleLabel = camp.myRole === 'player' ? 'Player' : 'DM / GM';
      return {
        id: String(camp.id),
        title: camp.name,
        subtitle: `${camp.systemLabel || 'D&D 5e'} · ${roleLabel} · ${camp.currentAct || 'Act II'}`,
        badgeLabel: active ? 'ACTIVE' : 'Select',
        badgeTone: active ? 'emerald' : 'neutral',
        active,
      };
    });
  });

  readonly campaignFooterActions: readonly LwContextSwitcherAction[] = [
    { id: 'manage-campaigns', label: 'Manage Campaigns & Quests', variant: 'secondary' },
  ];

  readonly sessionSwitcherOptions = computed<readonly LwContextSwitcherOption[]>(() => {
    const activeId = this.store?.activeSessionId() ?? '';
    return this.resolvedSessions().map((sess) => {
      const active = sess.sessionId === activeId;
      const formattedTitle = sess.title.toLowerCase().startsWith('session')
        ? sess.title
        : `Session ${sess.sessionNumber} — ${sess.title}`;
      const subParts = [sess.locationLabel, sess.statusLabel].filter(Boolean);
      return {
        id: sess.sessionId,
        title: formattedTitle,
        subtitle: subParts.join(' · '),
        badgeLabel: active ? 'CURRENT' : 'Switch',
        badgeTone: active ? 'emerald' : 'neutral',
        active,
      };
    });
  });

  readonly sessionFooterActions: readonly LwContextSwitcherAction[] = [
    { id: 'open-sessions', label: 'Open Sessions Planner', variant: 'secondary' },
    { id: 'open-guide', label: 'Session Adventure Guide', variant: 'emerald' },
  ];

  onCampaignOpenChange(isOpen: boolean): void {
    if (isOpen) {
      this.sessionDropdownOpen.set(false);
    }
    this.campaignDropdownOpen.set(isOpen);
  }

  onSessionOpenChange(isOpen: boolean): void {
    if (isOpen) {
      this.campaignDropdownOpen.set(false);
    }
    this.sessionDropdownOpen.set(isOpen);
  }

  onCampaignOptionSelected(campaignIdRaw: string): void {
    const campaignId = Number(campaignIdRaw);
    if (!Number.isFinite(campaignId) || campaignId <= 0) return;
    this.campaignDropdownOpen.set(false);
    this.campaignSelected.emit(campaignId);
    if (this.store && this.store.activeCampaignId() !== campaignId) {
      this.store.setCampaign(campaignId);
    }
  }

  onCampaignActionSelected(actionId: string): void {
    this.campaignDropdownOpen.set(false);
    if (actionId === 'manage-campaigns') {
      void this.router?.navigateByUrl('/campaigns');
    }
  }

  onSessionOptionSelected(sessionId: string): void {
    this.sessionDropdownOpen.set(false);
    this.store?.setActiveSession(sessionId);
  }

  onSessionActionSelected(actionId: string): void {
    this.sessionDropdownOpen.set(false);
    if (actionId === 'open-sessions') {
      void this.router?.navigateByUrl('/sessions');
    } else if (actionId === 'open-guide') {
      this.store?.openAdventureGuideModal('session');
    }
  }

  onSubmitSearch(): void {
    this.searchSubmitted.emit(this.searchText().trim());
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.campaignDropdownOpen.set(false);
      this.sessionDropdownOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.campaignDropdownOpen.set(false);
    this.sessionDropdownOpen.set(false);
  }
}
