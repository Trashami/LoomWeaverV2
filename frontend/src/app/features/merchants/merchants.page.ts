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
import {
  LwBadgeComponent,
  LwIconComponent,
  LwModalComponent,
  LwPageHeaderComponent,
} from '../../shared/ui/public-api';
import {
  LwMerchantSummaryVm,
  MerchantsApiService,
} from './merchants-api.service';

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
    LwModalComponent,
  ],
  templateUrl: './merchants.page.html',
  styleUrl: './merchants.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantsPageComponent {
  readonly store = inject(LoomWeaverStoreService);
  private readonly api = inject(MerchantsApiService);
  private readonly router = inject(Router);

  readonly merchants = signal<readonly LwMerchantSummaryVm[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly activeTab = signal<MerchantFilterTab>('all');
  readonly searchQuery = signal('');
  readonly createModalOpen = signal(false);
  readonly isGmMode = signal(false);

  // Random Forge Modal state
  readonly randomModalOpen = signal(false);
  readonly randomMerchantType = signal('random');
  readonly randomPopulateInventory = signal(true);
  readonly randomLocation = signal('');
  readonly generatingRandom = signal(false);

  readonly merchantTypes: readonly string[] = [
    'Blacksmith & Armory',
    'Alchemist & Apothecary',
    'Arcane & Wandmaker',
    'General Goods & Provisions',
    'Jeweler & Gemcutter',
    'Curios & Antiquities',
    'Tavern & Brewer',
    'Fletcher & Bowyer',
    'Tailor & Weaver',
    'Wandering Exotic Trader',
  ];

  // New merchant form model
  readonly newStoreName = signal('');
  readonly newMerchantName = signal('');
  readonly newTagline = signal('');
  readonly newDescription = signal('');
  readonly newLocationName = signal('');
  readonly newGreeting = signal('Welcome! Look around, tell me what catches your eye.');
  readonly newRollTableName = signal('');
  readonly newBuyRate = signal(50);
  readonly newMarkup = signal(100);

  readonly activeCampaign = computed(() => this.store.activeCampaign());
  readonly isGm = computed(() => this.store.isGmForActiveCampaign() || this.store.viewerRole() === 'gm');
  readonly currentLocation = computed(() => this.activeCampaign().currentLocationName || 'Starting Location');

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

  openCreateModal(): void {
    this.newStoreName.set('');
    this.newMerchantName.set('');
    this.newTagline.set('');
    this.newDescription.set('');
    this.newLocationName.set(this.currentLocation());
    this.newGreeting.set('Welcome! Look around, tell me what catches your eye.');
    this.newRollTableName.set('Magic Item Table A');
    this.newBuyRate.set(50);
    this.newMarkup.set(100);
    this.createModalOpen.set(true);
  }

  submitCreateMerchant(): void {
    if (!this.newStoreName().trim()) return;

    const cid = this.store.activeCampaignId() || 1;
    this.api
      .createMerchant(cid, {
        storeName: this.newStoreName().trim(),
        merchantName: this.newMerchantName().trim() || 'Shopkeeper',
        tagline: this.newTagline().trim(),
        description: this.newDescription().trim(),
        locationName: this.newLocationName().trim() || this.currentLocation(),
        greeting: this.newGreeting().trim(),
        rollTableName: this.newRollTableName().trim(),
        buyRatePercent: this.newBuyRate(),
        markupPercent: this.newMarkup(),
        imageUrl: '/portraits/default-merchant.png',
        bannerUrl: '/campaigns/market-banner.jpg',
        isUnlocked: true,
      })
      .subscribe({
        next: () => {
          this.createModalOpen.set(false);
          this.loadMerchants();
        },
        error: () => {
          this.errorMessage.set('Could not create merchant.');
        },
      });
  }

  openRandomModal(): void {
    this.randomMerchantType.set('random');
    this.randomPopulateInventory.set(true);
    this.randomLocation.set(this.currentLocation());
    this.randomModalOpen.set(true);
  }

  submitGenerateRandom(): void {
    const cid = this.store.activeCampaignId() || 1;
    this.generatingRandom.set(true);

    const type = this.randomMerchantType();
    this.api
      .generateRandomMerchant(cid, {
        merchantType: type === 'random' ? undefined : type,
        populateInventory: this.randomPopulateInventory(),
        locationName: this.randomLocation().trim() || this.currentLocation(),
      })
      .subscribe({
        next: (created) => {
          this.generatingRandom.set(false);
          this.randomModalOpen.set(false);
          this.loadMerchants();
          this.router.navigate(['/merchants', created.id]);
        },
        error: () => {
          this.generatingRandom.set(false);
          this.errorMessage.set('Could not forge random merchant.');
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
