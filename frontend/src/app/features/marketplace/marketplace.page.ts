import { MonsterMarketComponent } from '../bestiary/market/monster-market.component';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ItemMarketComponent } from '../items/market/item-market.component';
import { HttpClient } from '@angular/common/http';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { CampaignMembershipService } from '../../core/services/campaign-membership.service';
import {
  LwAssetCardComponent,
  LwBadgeComponent,
  LwButtonComponent,
  LwCreatorModuleCardComponent,
  LwCreatorModuleItem,
  LwPanelComponent,
} from '../../shared/ui/public-api';

const DEFAULT_CREATOR_MODULES: readonly LwCreatorModuleItem[] = [];

@Component({
  selector: 'lw-marketplace-page',
  standalone: true,
  imports: [MonsterMarketComponent, ItemMarketComponent,
    LwPanelComponent,
    LwBadgeComponent,
    LwButtonComponent,
    LwAssetCardComponent,
    LwCreatorModuleCardComponent,
  ],
  templateUrl: './marketplace.page.html',
  styleUrl: './marketplace.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplacePageComponent {
  private readonly http = inject(HttpClient);
  readonly store = inject(LoomWeaverStoreService);
  private readonly membership = inject(CampaignMembershipService);
  readonly auth = inject(AuthSessionService);
  readonly generativeAiEnabled = input<boolean>(false);
  readonly isWeaveEnabled = computed(
    () => this.generativeAiEnabled() || this.store.weaveEnabled(),
  );

  readonly activeTierCode = signal<string>('weaver');
  readonly creatorModules = signal<readonly LwCreatorModuleItem[]>(DEFAULT_CREATOR_MODULES);
  readonly statusBanner = signal<string>(
    'Creator-first 85/15 split active · Players join tables 100% free via invite links.',
  );

  readonly calculatorPrice = signal<number>(20);
  readonly creatorPayout = computed(() => (this.calculatorPrice() * 0.85).toFixed(2));
  readonly platformFee = computed(() => (this.calculatorPrice() * 0.15).toFixed(2));

  readonly exportedManifestPreview = signal<string | null>(null);
  readonly generatedInviteUrl = signal<string>('');

  constructor() {
    this.http.get<readonly LwCreatorModuleItem[]>('/api/v2/marketplace/modules').subscribe({
      next: (res) => {
        if (res?.length) this.creatorModules.set(res);
      },
      error: () => {},
    });
  }

  onPriceSliderInput(event: Event): void {
    this.calculatorPrice.set(Number((event.target as HTMLInputElement).value));
  }

  importCreatorModule(moduleId: string): void {
    const found = this.creatorModules().find((m) => m.id === moduleId);
    if (found) {
      this.auth.executeStripeCheckout(
        found.id,
        found.title,
        found.creatorHandle,
        found.priceUsd,
      );
    }

    this.http
      .post<{ module: LwCreatorModuleItem; message: string }>(
        `/api/v2/marketplace/modules/${moduleId}/import`,
        {},
      )
      .subscribe({
        next: (res) => {
          if (res?.module) {
            this.creatorModules.update((list) =>
              list.map((m) => (m.id === moduleId ? res.module : m)),
            );
          }
          if (res?.message) this.statusBanner.set(res.message);
        },
        error: () => {
          this.creatorModules.update((list) =>
            list.map((m) =>
              m.id === moduleId
                ? { ...m, installed: true, popularityImports: m.popularityImports + 1 }
                : m,
            ),
          );
          this.statusBanner.set(`One-click imported module "${moduleId}" into the active campaign.`);
        },
      });
  }

  exportCampaignPackage(): void {
    this.http.get(`/api/v2/campaigns/${this.store.activeCampaignId()}/export-package`).subscribe({
      next: (pkg) => {
        this.exportedManifestPreview.set(JSON.stringify(pkg, null, 2));
        this.statusBanner.set('Exported portable JSON Campaign Package v2.0 for external backup or Marketplace publishing.');
      },
      error: () => {
        this.statusBanner.set('The campaign package could not be exported.');
      },
    });
  }

  generateFreePlayerInvite(): void {
    this.membership.createInvite(this.store.activeCampaignId()).subscribe({
      next: (res) => {
        this.generatedInviteUrl.set(res.inviteUrl);
        this.statusBanner.set(`Generated a player invite link. It expires in ${res.expiresInDays} days and allows ${res.maxUses} joins.`);
      },
      error: () => this.statusBanner.set('Only the campaign GM can create invite links.'),
    });
  }
}
