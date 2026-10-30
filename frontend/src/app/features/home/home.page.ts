import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import {
  DashboardActivityItemVm,
  DashboardAlertItemVm,
  DashboardNoteItemVm,
} from '../../core/models/dashboard.models';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwCampaignResumeCardComponent,
  LwCreatePlaceholderComponent,
  LwDashboardAlertsCardComponent,
  LwIconComponent,
  LwPartyMemberStatusVm,
  LwPartyRosterCardComponent,
  LwQuestTrackerCardComponent,
  LwQuestTrackerItem,
  LwRecentActivityFeedComponent,
  LwRecentNotesCardComponent,
  LwUpcomingSessionCardComponent,
} from '../../shared/ui/public-api';

@Component({
  selector: 'lw-home-page',
  standalone: true,
  imports: [
    RouterLink,
    NgpButton,
    LwIconComponent,
    LwCampaignResumeCardComponent,
    LwUpcomingSessionCardComponent,
    LwRecentActivityFeedComponent,
    LwRecentNotesCardComponent,
    LwQuestTrackerCardComponent,
    LwPartyRosterCardComponent,
    LwDashboardAlertsCardComponent,
    LwCreatePlaceholderComponent,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  private readonly router = inject(Router);
  readonly store = inject(LoomWeaverStoreService);
  readonly auth = inject(AuthSessionService);

  readonly selectedQuestId = signal<string>('quest-shadows-stone');

  readonly dashboard = computed(() => this.store.campaignDashboard());

  readonly questTrackerItems = computed<readonly LwQuestTrackerItem[]>(() =>
    this.dashboard().activeQuests.map((q) => ({
      id: q.id,
      title: q.title,
      summary: q.summary,
      categoryBadge: q.categoryBadge,
      badgeTone: q.badgeTone,
      questGiver: 'Campaign Chronicle',
      originLocation: this.store.activeCampaign().currentLocationName,
      completionLocation: this.store.activeCampaign().worldName,
      prerequisites: 'None',
      xpReward: 1200,
      status: 'active',
      clueKeys: [q.compositeKey],
      steps: [
        {
          stepId: `${q.id}-step-1`,
          description: q.summary,
          locationName: this.store.activeCampaign().currentLocationName,
          completed: false,
        },
      ],
    })),
  );

  onActivitySelected(item: DashboardActivityItemVm): void {
    this.store.inspectEntity(item.compositeKey);
  }

  onNoteSelected(note: DashboardNoteItemVm): void {
    this.store.inspectEntity(note.compositeKey);
  }

  onQuestSelected(quest: LwQuestTrackerItem): void {
    this.selectedQuestId.set(quest.id);
    if (quest.clueKeys.length > 0) {
      this.store.inspectEntity(quest.clueKeys[0]);
    }
    void this.router.navigate(['/campaigns']);
  }

  onMemberSelected(member: LwPartyMemberStatusVm): void {
    this.store.inspectEntity(member.compositeKey);
    void this.router.navigateByUrl(member.routeLink || '/characters');
  }

  onAlertSelected(alert: DashboardAlertItemVm): void {
    this.store.acknowledgeDashboardAlert(alert.id);
  }

  openCharacterStudio(): void {
    void this.router.navigate(['/characters']);
  }
}
