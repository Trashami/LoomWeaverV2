import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { WorldLoreFacadeService } from '../../core/services/world-lore-facade.service';
import {
  LwIconComponent,
  LwPageHeaderComponent,
} from '../../shared/ui/public-api';
import {
  LwMerchantSummaryVm,
  MerchantsApiService,
} from './merchants-api.service';
import { FANTASY_NPC_NAMES } from './merchant-generator.helpers';
import { MerchantChoiceModalComponent } from './components/merchant-choice-modal/merchant-choice-modal.component';
import { MerchantRandomModalComponent } from './components/merchant-random-modal/merchant-random-modal.component';
import { MerchantCreateModalComponent } from './components/merchant-create-modal/merchant-create-modal.component';

type MerchantFilterTab = 'all' | 'near' | 'visited';

@Component({
  selector: 'lw-merchants-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NgpButton,
    LwPageHeaderComponent,
    LwIconComponent,
    MerchantChoiceModalComponent,
    MerchantRandomModalComponent,
    MerchantCreateModalComponent,
  ],
  templateUrl: './merchants.page.html',
  styleUrl: './merchants.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantsPageComponent {
  readonly store = inject(LoomWeaverStoreService);
  private readonly worldLore = inject(WorldLoreFacadeService);
  private readonly api = inject(MerchantsApiService);
  private readonly router = inject(Router);

  readonly merchants = signal<readonly LwMerchantSummaryVm[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly activeTab = signal<MerchantFilterTab>('all');
  readonly searchQuery = signal('');
  readonly isGmMode = signal(false);

  // Modals state
  readonly choiceModalOpen = signal(false);
  readonly randomModalOpen = signal(false);
  readonly createModalOpen = signal(false);
  readonly actionBusy = signal(false);

  readonly activeCampaign = computed(() => this.store.activeCampaign());
  readonly isGm = computed(() => this.store.isGmForActiveCampaign() || this.store.viewerRole() === 'gm');
  readonly currentLocation = computed(() => this.activeCampaign().currentLocationName || 'Vandia Harbor');

  // Aggregated campaign locations from multiple data sources
  readonly campaignLocations = computed<readonly string[]>(() => {
    const set = new Set<string>();
    const curr = this.currentLocation();
    if (curr) set.add(curr);

    // From active sessions
    this.store.sessions().forEach((s) => {
      if (s.locationName) set.add(s.locationName);
      if (s.locationLabel) set.add(s.locationLabel);
    });

    // From world lore markers
    this.worldLore.workspace().markers.forEach((m) => {
      if (m.name && (m.category === 'Settlements' || m.category === 'Locations' || m.category === 'Regions')) {
        set.add(m.name);
      }
    });

    // Curated campaign geography
    ['Vandia Harbor', 'Cinth High Market', 'Plains of Vistagh', 'Bay of Forgotten Treasures', 'Whispering Grove'].forEach(
      (loc) => set.add(loc),
    );

    return Array.from(set);
  });

  // Aggregated campaign NPCs from multiple data sources
  readonly campaignNpcs = computed<readonly string[]>(() => {
    const set = new Set<string>();

    // From campaign dashboard guide
    const guideNpcs = this.store.campaignDashboard().sessionGuide?.keyNpcs ?? [];
    guideNpcs.forEach((n) => {
      if (typeof n === 'string') set.add(n);
      else if (n && typeof n === 'object' && 'name' in n) set.add((n as { name: string }).name);
    });

    // From world lore markers
    this.worldLore.workspace().markers.forEach((m) => {
      if (m.name && m.category === 'NPCs') set.add(m.name);
    });

    // Curated fantasy D&D NPC shopkeepers
    FANTASY_NPC_NAMES.slice(0, 15).forEach((name) => set.add(name));

    return Array.from(set);
  });

  readonly filteredMerchants = computed(() => {
    const list = this.merchants();
    const tab = this.activeTab();
    const query = this.searchQuery().toLowerCase().trim();

    return list.filter((m) => {
      if (tab === 'near' && !m.isAtCurrentLocation) return false;
      if (tab === 'visited' && !m.hasVisited) return false;
      if (query) {
        const matchesName = m.storeName.toLowerCase().includes(query);
        const matchesMerchant = m.merchantName.toLowerCase().includes(query);
        const matchesLoc = m.locationName.toLowerCase().includes(query);
        const matchesTag = m.tagline.toLowerCase().includes(query);
        if (!matchesName && !matchesMerchant && !matchesLoc && !matchesTag) return false;
      }
      return true;
    });
  });

  readonly nearCount = computed(() => this.merchants().filter((m) => m.isAtCurrentLocation).length);
  readonly visitedCount = computed(() => this.merchants().filter((m) => m.hasVisited).length);

  constructor() {
    this.isGmMode.set(this.isGm());
    this.loadMerchants();
  }

  loadMerchants(): void {
    const cid = this.store.activeCampaignId() || 1;
    const charKey = this.store.activeCampaignPlayers().find((p) => p.assignedCharacterKey)?.assignedCharacterKey;
    this.loading.set(true);
    this.errorMessage.set('');

    this.api.listMerchants(cid, charKey).subscribe({
      next: (data) => {
        this.merchants.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load campaign merchants.');
        this.loading.set(false);
      },
    });
  }

  setTab(tab: MerchantFilterTab): void {
    this.activeTab.set(tab);
  }

  openMerchantStore(merchant: LwMerchantSummaryVm): void {
    this.router.navigate(['/merchants', merchant.id]);
  }

  openAddMerchantChoice(): void {
    this.choiceModalOpen.set(true);
  }

  onChoiceRandom(): void {
    this.randomModalOpen.set(true);
  }

  onChoiceManual(): void {
    this.createModalOpen.set(true);
  }

  onRandomConfirmed(payload: {
    merchantType: string;
    storeName: string;
    merchantName: string;
    locationName: string;
    populateInventory: boolean;
  }): void {
    const cid = this.store.activeCampaignId() || 1;
    this.actionBusy.set(true);

    this.api
      .generateRandomMerchant(cid, {
        merchantType: payload.merchantType,
        populateInventory: payload.populateInventory,
        locationName: payload.locationName,
        storeName: payload.storeName,
        merchantName: payload.merchantName,
      })
      .subscribe({
        next: (created) => {
          this.actionBusy.set(false);
          this.randomModalOpen.set(false);
          this.loadMerchants();
          this.router.navigate(['/merchants', created.id]);
        },
        error: () => {
          this.actionBusy.set(false);
          this.errorMessage.set('Could not establish random merchant.');
        },
      });
  }

  onManualCreated(payload: {
    storeName: string;
    merchantName: string;
    merchantType: string;
    locationName: string;
    tagline: string;
    description: string;
    greeting: string;
    buyRatePercent: number;
    markupPercent: number;
  }): void {
    const cid = this.store.activeCampaignId() || 1;
    this.actionBusy.set(true);

    this.api
      .createMerchant(cid, {
        storeName: payload.storeName,
        merchantName: payload.merchantName,
        merchantType: payload.merchantType,
        locationName: payload.locationName,
        tagline: payload.tagline,
        description: payload.description,
        greeting: payload.greeting,
        buyRatePercent: payload.buyRatePercent,
        markupPercent: payload.markupPercent,
        imageUrl: `/portraits/merchants/${payload.merchantType.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-')}.png`,
        bannerUrl: '/campaigns/market-banner.jpg',
        isUnlocked: true,
      })
      .subscribe({
        next: (created) => {
          this.actionBusy.set(false);
          this.createModalOpen.set(false);
          this.loadMerchants();
          this.router.navigate(['/merchants', created.id]);
        },
        error: () => {
          this.actionBusy.set(false);
          this.errorMessage.set('Could not create merchant.');
        },
      });
  }

  deleteMerchant(merchant: LwMerchantSummaryVm, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Are you sure you want to remove ${merchant.storeName}?`)) return;

    const cid = this.store.activeCampaignId() || 1;
    this.api.deleteMerchant(cid, merchant.id).subscribe({
      next: () => this.loadMerchants(),
      error: () => this.errorMessage.set('Could not delete merchant.'),
    });
  }
}
