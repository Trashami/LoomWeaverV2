import { MonsterMarketComponent } from '../bestiary/market/monster-market.component';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ItemMarketComponent } from '../items/market/item-market.component';
import { HttpClient } from '@angular/common/http';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwAssetCardComponent,
  LwBadgeComponent,
  LwButtonComponent,
  LwCreatorModuleCardComponent,
  LwCreatorModuleItem,
  LwPanelComponent,
} from '../../shared/ui/public-api';

const DEFAULT_CREATOR_MODULES: readonly LwCreatorModuleItem[] = [
  {
    id: 'mod-cinth-masquerade-pack',
    title: 'Cinth Masquerade & Artificer District Campaign Module',
    creatorHandle: '@TrashamiChronicles',
    category: 'Adventure Module',
    priceUsd: 24.0,
    creatorShareUsd: 20.4,
    platformShareUsd: 3.6,
    royaltySplitLabel: '85% Creator ($20.40) / 15% Platform ($3.60)',
    popularityImports: 1420,
    rating: 4.9,
    summary:
      'Complete Book One Cinth act with 3D ballroom maps, vampire coven statblocks, Artificer Guild NPCs, and 4-stem waltz audio.',
    includedItems: [
      '3 Babylon.js Battlemaps',
      '9 Custom NPCs & Vampires',
      '4 Adaptive Audio Stems',
      '12 Graph Nodes',
    ],
    installed: true,
  },
  {
    id: 'mod-shadow-mountain-raid',
    title: 'Shadow of the Mountain — Runic Cavern & Dragon Boss Pack',
    creatorHandle: '@TrashamiChronicles',
    category: 'Boss Encounter',
    priceUsd: 18.0,
    creatorShareUsd: 15.3,
    platformShareUsd: 2.7,
    royaltySplitLabel: '85% Creator ($15.30) / 15% Platform ($2.70)',
    popularityImports: 1185,
    rating: 5.0,
    summary:
      'Multi-phase ancient bound dragon encounter with glowing containment runes, poisoned canopy scatter assets, and custom EffectBuilder timelines.',
    includedItems: [
      'Runic Cavern 3D Map',
      'Ancient Bound Dragon Boss',
      '5 Spell FX Timelines',
      'Runed Obsidian Dice Skin',
    ],
    installed: true,
  },
  {
    id: 'mod-skyship-lost-isles',
    title: "Kutler's Skyship & Lost Isles Chokrah Investigation",
    creatorHandle: '@IcrandorCartography',
    category: 'Expansion Pack',
    priceUsd: 16.0,
    creatorShareUsd: 13.6,
    platformShareUsd: 2.4,
    royaltySplitLabel: '85% Creator ($13.60) / 15% Platform ($2.40)',
    popularityImports: 890,
    rating: 4.8,
    summary:
      'Steampunk-adjacent artificer skyship deck plans, Chokrah cargo manifests, and Book Two borderland village siege encounters.',
    includedItems: [
      'Multi-Deck Skyship Map',
      'Artificer Clockwork Brass Dice',
      '6 Homebrew Actions',
      'Skyship Wind Audio Preset',
    ],
    installed: false,
  },
];

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
  readonly generatedInviteUrl = signal<string>(
    'https://loom-weaver.com/campaigns?join=SOTM-CINTH-FREE',
  );

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
          this.statusBanner.set(`One-click imported module "${moduleId}" into Campaign #1.`);
        },
      });
  }

  exportCampaignPackage(): void {
    this.http.get('/api/v2/campaigns/1/export-package').subscribe({
      next: (pkg) => {
        this.exportedManifestPreview.set(JSON.stringify(pkg, null, 2));
        this.statusBanner.set('Exported portable JSON Campaign Package v2.0 for external backup or Marketplace publishing.');
      },
      error: () => {
        this.exportedManifestPreview.set(
          JSON.stringify(
            {
              schemaVersion: 'loomweaver-package-v2.0',
              campaignId: 1,
              campaignTitle: 'Shadow of the Mountain — Book I & II Chronicle',
              royaltyStandard: '85/15 Creator Split',
            },
            null,
            2,
          ),
        );
      },
    });
  }

  generateFreePlayerInvite(): void {
    this.http
      .post<{ inviteUrl: string; playerCost: string }>('/api/v2/campaigns/1/invite-link', {})
      .subscribe({
        next: (res) => {
          if (res?.inviteUrl) this.generatedInviteUrl.set(res.inviteUrl);
          this.statusBanner.set(
            `Generated frictionless player invite link (${res?.playerCost ?? '100% Free'}).`,
          );
        },
        error: () => {},
      });
  }
}
