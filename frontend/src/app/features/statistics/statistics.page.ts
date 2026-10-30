import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwAchievementCardComponent,
  LwAchievementCardData,
  LwBadgeComponent,
  LwButtonComponent,
  LwPanelComponent,
  LwStatRadarComponent,
  StatRadarAxis,
} from '../../shared/ui/public-api';

interface CharacterTelemetry {
  readonly characterId: string;
  readonly name: string;
  readonly classTitle: string;
  readonly totalDamageDealt: number;
  readonly damageMitigated: number;
  readonly supportAndHealing: number;
  readonly criticalHits: number;
  readonly actionsExecuted: number;
  readonly cluesDiscovered: number;
  readonly radarProfile: readonly StatRadarAxis[];
}

interface DamageTypeBreakdown {
  readonly damageType: string;
  readonly colorHex: string;
  readonly totalDamage: number;
  readonly sharePercent: number;
  readonly peakSingleHit: number;
  readonly signatureSource: string;
}

interface CampaignAnalyticsPayload {
  readonly campaignId: number;
  readonly campaignName: string;
  readonly sessionsCompleted: number;
  readonly encountersCleared: number;
  readonly totalXpEarned: number;
  readonly totalDiceRolled: number;
  readonly nat20Count: number;
  readonly nat1Count: number;
  readonly averageD20Roll: number;
  readonly partyRadar: readonly StatRadarAxis[];
  readonly characterTelemetry: readonly CharacterTelemetry[];
  readonly damageBreakdown: readonly DamageTypeBreakdown[];
  readonly achievements: readonly LwAchievementCardData[];
}

const EMPTY_ANALYTICS: CampaignAnalyticsPayload = {
  campaignId: 0,
  campaignName: '',
  sessionsCompleted: 0,
  encountersCleared: 0,
  totalXpEarned: 0,
  totalDiceRolled: 0,
  nat20Count: 0,
  nat1Count: 0,
  averageD20Roll: 0,
  partyRadar: [],
  characterTelemetry: [],
  damageBreakdown: [],
  achievements: [],
};

@Component({
  selector: 'lw-statistics-page',
  standalone: true,
  imports: [
    RouterLink,
    LwPanelComponent,
    LwBadgeComponent,
    LwButtonComponent,
    LwStatRadarComponent,
    LwAchievementCardComponent,
  ],
  templateUrl: './statistics.page.html',
  styleUrl: './statistics.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatisticsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);

  readonly analytics = signal<CampaignAnalyticsPayload>(EMPTY_ANALYTICS);
  readonly selectedCharacterId = signal<string>('');

  readonly selectedCharacter = computed<CharacterTelemetry | undefined>(
    () =>
      this.analytics().characterTelemetry.find((c) => c.characterId === this.selectedCharacterId()) ??
      this.analytics().characterTelemetry[0],
  );

  readonly nat20RatePercent = computed(() => {
    const a = this.analytics();
    return a.totalDiceRolled > 0 ? ((a.nat20Count / a.totalDiceRolled) * 100).toFixed(1) : '0.0';
  });

  constructor() {
    this.refreshAnalytics();
  }

  refreshAnalytics(): void {
    this.http.get<CampaignAnalyticsPayload>(`/api/v2/campaigns/${this.store.activeCampaignId()}/analytics`).subscribe({
      next: (res) => {
        if (res) {
          this.analytics.set(res);
        }
      },
      error: () => {},
    });
  }
}
