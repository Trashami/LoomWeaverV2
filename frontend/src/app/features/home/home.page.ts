import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DashboardAlertItemVm } from '../../core/models/dashboard.models';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwCreatePlaceholderComponent, LwPageHeaderComponent, LwPanelComponent } from '../../shared/ui/public-api';

interface WorldMapTile {
  readonly label: string;
  readonly hint: string;
  readonly route: string;
}

const WORLD_MAP_TILES: readonly WorldMapTile[] = [
  { label: 'Quests & Story', hint: 'Active threads and chronicle', route: '/campaigns' },
  { label: 'Sessions', hint: 'Plan and run play sessions', route: '/loom' },
  { label: 'Lore & Locations', hint: 'Places, factions, and history', route: '/weave' },
  { label: 'Maps', hint: 'Regions and battlemaps', route: '/maps' },
  { label: 'Characters', hint: 'Party sheets and level-ups', route: '/characters' },
  { label: 'Encounters', hint: 'Combat and the Arcane Screen', route: '/encounters' },
  { label: 'Bestiary', hint: 'Creatures and NPC stat blocks', route: '/bestiary' },
  { label: 'Items & Spells', hint: 'Gear, magic, and effects', route: '/items' },
  { label: 'Timelines', hint: 'Session history and table log', route: '/timeline' },
  { label: 'Handouts & Clues', hint: 'Player-facing documents', route: '/handouts' },
  { label: 'Sourcebooks', hint: 'Reference rules and books', route: '/sources' },
];

@Component({
  selector: 'lw-home-page',
  standalone: true,
  imports: [RouterLink, LwPanelComponent, LwPageHeaderComponent, LwCreatePlaceholderComponent],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  private readonly router = inject(Router);
  readonly store = inject(LoomWeaverStoreService);

  readonly dashboard = computed(() => this.store.campaignDashboard());
  readonly worldMapTiles = WORLD_MAP_TILES;

  readonly openPrepItems = computed(() =>
    this.dashboard().upcomingSession.checklist.filter((item) => !item.completed),
  );

  readonly donePrepItems = computed(() =>
    this.dashboard().upcomingSession.checklist.filter((item) => item.completed),
  );

  readonly doneBeats = computed(() => this.dashboard().sessionGuide.beats.filter((b) => b.done));

  readonly openBeats = computed(() => this.dashboard().sessionGuide.beats.filter((b) => !b.done));

  readonly unreadAlerts = computed(() => this.dashboard().alerts.filter((a) => !a.read));

  readonly hasSessions = computed(() => this.dashboard().sessionState !== 'no_sessions');

  openItem(routeLink: string, compositeKey?: string): void {
    if (compositeKey) {
      this.store.inspectEntity(compositeKey);
    }
    if (routeLink) {
      void this.router.navigateByUrl(routeLink);
    }
  }

  acknowledgeAlert(alert: DashboardAlertItemVm): void {
    this.store.acknowledgeDashboardAlert(alert.id);
  }
}
