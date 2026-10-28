import { HttpClient } from '@angular/common/http';
import { effect } from '@angular/core';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { EquipmentLoadoutItemVm } from '../models/character-studio.models';

export function syncCatalogInventory(http: HttpClient, store: LoomWeaverStoreService, auth: AuthSessionService,
  clear: () => void, merge: (campaign: number, key: string, items: readonly EquipmentLoadoutItemVm[]) => void): void {
    effect(onCleanup => {
      const campaignId = store.activeCampaignId();
      const accountId = auth.activeProfile().accountId;
      let cancelled = false;
      onCleanup(() => { cancelled = true; });
      // Remove previously loaded inventory when identity or campaign changes.
      clear();
      http.get<{ characterKey: string }>(`/api/v2/campaigns/${campaignId}/items-context`).subscribe({
        next: context => {
          if (cancelled || !context.characterKey) return;
          http.get<readonly EquipmentLoadoutItemVm[]>(`/api/v2/campaigns/${campaignId}/characters/${encodeURIComponent(context.characterKey)}/items`).subscribe({
            next: equipment => { if (!cancelled) merge(campaignId, context.characterKey, equipment); },
            error: () => {},
          });
        }, error: () => {},
      });
    });
}
