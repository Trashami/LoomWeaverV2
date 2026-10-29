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

const DEFAULT_ANALYTICS: CampaignAnalyticsPayload = {
  campaignId: 1,
  campaignName: 'Shadow of the Mountain — Book I & II Chronicle',
  sessionsCompleted: 18,
  encountersCleared: 14,
  totalXpEarned: 28450,
  totalDiceRolled: 415,
  nat20Count: 30,
  nat1Count: 14,
  averageD20Roll: 11.42,
  partyRadar: [
    { label: 'Tactical Combat', value: 92 },
    { label: 'Lore & Investigation', value: 86 },
    { label: 'Roleplay & Intrigue', value: 84 },
    { label: 'Exploration & Travel', value: 79 },
    { label: 'Action Economy', value: 91 },
    { label: 'Resource Survival', value: 77 },
  ],
  characterTelemetry: [
    {
      characterId: 'char-dal',
      name: 'Dal',
      classTitle: 'Edhellainian Ranger / Heir in Exile',
      totalDamageDealt: 486,
      damageMitigated: 140,
      supportAndHealing: 95,
      criticalHits: 9,
      actionsExecuted: 38,
      cluesDiscovered: 19,
      radarProfile: [
        { label: 'Combat', value: 88 },
        { label: 'Lore', value: 82 },
        { label: 'Roleplay', value: 79 },
        { label: 'Perception', value: 96 },
        { label: 'Stealth', value: 94 },
        { label: 'Survival', value: 90 },
      ],
    },
    {
      characterId: 'char-fivi',
      name: 'Fivi',
      classTitle: 'Feywild Outcast / Arcane Trickster',
      totalDamageDealt: 418,
      damageMitigated: 85,
      supportAndHealing: 162,
      criticalHits: 11,
      actionsExecuted: 42,
      cluesDiscovered: 15,
      radarProfile: [
        { label: 'Combat', value: 84 },
        { label: 'Lore', value: 76 },
        { label: 'Roleplay', value: 95 },
        { label: 'Chaos Logic', value: 99 },
        { label: 'Stealth', value: 91 },
        { label: 'Survival', value: 72 },
      ],
    },
    {
      characterId: 'char-kildrid',
      name: 'Kildrid',
      classTitle: 'Dwarven Stone-Scholar & Runesmith',
      totalDamageDealt: 342,
      damageMitigated: 390,
      supportAndHealing: 284,
      criticalHits: 5,
      actionsExecuted: 35,
      cluesDiscovered: 24,
      radarProfile: [
        { label: 'Combat', value: 78 },
        { label: 'Lore', value: 98 },
        { label: 'Roleplay', value: 82 },
        { label: 'Stone Sense', value: 99 },
        { label: 'Defense', value: 92 },
        { label: 'Survival', value: 86 },
      ],
    },
    {
      characterId: 'char-kycius',
      name: 'Kycius',
      classTitle: 'Spellblade & Seeker of Lost Truth',
      totalDamageDealt: 452,
      damageMitigated: 175,
      supportAndHealing: 148,
      criticalHits: 8,
      actionsExecuted: 39,
      cluesDiscovered: 21,
      radarProfile: [
        { label: 'Combat', value: 90 },
        { label: 'Lore', value: 91 },
        { label: 'Roleplay', value: 88 },
        { label: 'Insight', value: 95 },
        { label: 'Arcana', value: 93 },
        { label: 'Survival', value: 78 },
      ],
    },
    {
      characterId: 'char-munk',
      name: 'Munk',
      classTitle: 'Frontline Vanguard & Shield-Breaker',
      totalDamageDealt: 614,
      damageMitigated: 520,
      supportAndHealing: 64,
      criticalHits: 10,
      actionsExecuted: 41,
      cluesDiscovered: 9,
      radarProfile: [
        { label: 'Combat', value: 98 },
        { label: 'Lore', value: 62 },
        { label: 'Roleplay', value: 80 },
        { label: 'Vanguard', value: 97 },
        { label: 'Endurance', value: 96 },
        { label: 'Survival', value: 89 },
      ],
    },
  ],
  damageBreakdown: [
    {
      damageType: 'Slashing & Piercing',
      colorHex: '#e5b85c',
      totalDamage: 894,
      sharePercent: 38,
      peakSingleHit: 46,
      signatureSource: 'Munk Greatsword Cleave & Dal Longbow',
    },
    {
      damageType: 'Radiant & Luminary',
      colorHex: '#ffd97d',
      totalDamage: 542,
      sharePercent: 23,
      peakSingleHit: 58,
      signatureSource: 'Kildrid Rune Ward & Well of Life Echo',
    },
    {
      damageType: 'Fire & Drake Breath',
      colorHex: '#ff6b4a',
      totalDamage: 398,
      sharePercent: 17,
      peakSingleHit: 39,
      signatureSource: 'Kycius & Laksis Ignition Arc',
    },
    {
      damageType: 'Force & Fey Slingshot',
      colorHex: '#70d6ff',
      totalDamage: 305,
      sharePercent: 13,
      peakSingleHit: 44,
      signatureSource: 'Fivi Slingshot Tooth Critical',
    },
    {
      damageType: 'Necrotic & Shadow',
      colorHex: '#b87cff',
      totalDamage: 173,
      sharePercent: 9,
      peakSingleHit: 31,
      signatureSource: 'Cinth Vampire Counter-Ward',
    },
  ],
  achievements: [
    {
      id: 'ach-tooth-slingshot',
      title: 'Tooth of the Mountain',
      description:
        'Land the final killing blow on an ancient bound dragon using a slingshot loaded with a tooth.',
      category: 'Mythic Feat',
      rarity: 'Mythic',
      icon: 'book',
      currentValue: 1,
      targetValue: 1,
      unlocked: true,
      awardedTo: 'Fivi',
      xpBonus: 1500,
    },
    {
      id: 'ach-cinth-masquerade',
      title: 'Velvet & Fangs Unmasked',
      description:
        "Survive the Lord of Cinth's masquerade ambush and expose the vampire coven's bid for the city.",
      category: 'Story Milestone',
      rarity: 'Gold',
      icon: 'Shield',
      currentValue: 1,
      targetValue: 1,
      unlocked: true,
      awardedTo: 'Full Party',
      xpBonus: 1200,
    },
    {
      id: 'ach-artificer-compact',
      title: 'Engines Against Eternity',
      description:
        "Forge an alliance with the Cinth Artificers Guild and inspect Kutler's skyship.",
      category: 'Faction Accord',
      rarity: 'Arcane',
      icon: 'Wrench',
      currentValue: 1,
      targetValue: 1,
      unlocked: true,
      awardedTo: 'Kildrid & Kycius',
      xpBonus: 850,
    },
    {
      id: 'ach-dolly-pocket',
      title: 'The Quiet Maw',
      description:
        "Sew an extradimensional containment pocket inside Dolly's mouth along the road to Cinth.",
      category: 'Companion Craft',
      rarity: 'Gold',
      icon: 'Compass',
      currentValue: 1,
      targetValue: 1,
      unlocked: true,
      awardedTo: 'Kycius & Fivi',
      xpBonus: 500,
    },
    {
      id: 'ach-edhellain-lineage',
      title: 'Pages of the True Crown',
      description:
        "Recover the missing pages in Edhellain revealing Dal's royal lineage (Book Two Progression).",
      category: 'Chronicle Arc',
      rarity: 'Mythic',
      icon: 'BookOpen',
      currentValue: 2,
      targetValue: 3,
      unlocked: false,
      awardedTo: 'Dal',
      xpBonus: 2000,
    },
  ],
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

  readonly analytics = signal<CampaignAnalyticsPayload>(DEFAULT_ANALYTICS);
  readonly selectedCharacterId = signal<string>('char-fivi');

  readonly selectedCharacter = computed(
    () =>
      this.analytics()
        .characterTelemetry.find((c) => c.characterId === this.selectedCharacterId()) ??
      this.analytics().characterTelemetry[0],
  );

  readonly nat20RatePercent = computed(() => {
    const a = this.analytics();
    return a.totalDiceRolled > 0 ? ((a.nat20Count / a.totalDiceRolled) * 100).toFixed(1) : '7.2';
  });

  constructor() {
    this.refreshAnalytics();
  }

  refreshAnalytics(): void {
    this.http.get<CampaignAnalyticsPayload>(`/api/v2/campaigns/${this.store.activeCampaignId()}/analytics`).subscribe({
      next: (res) => {
        if (res?.partyRadar?.length) {
          this.analytics.set(res);
        }
      },
      error: () => {},
    });
  }
}
