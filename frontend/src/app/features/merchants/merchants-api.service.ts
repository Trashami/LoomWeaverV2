import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LwMerchantNpcVm {
  readonly name: string;
  readonly race: string;
  readonly merchantType: string;
  readonly demeanor: string;
  readonly quirk: string;
  readonly persuasionDc: number;
  readonly strength: number;
  readonly dexterity: number;
  readonly constitution: number;
  readonly intelligence: number;
  readonly wisdom: number;
  readonly charisma: number;
  readonly armorClass: number;
  readonly hitPoints: number;
  readonly locationName: string;
}

export interface LwMerchantSummaryVm {
  readonly id: number;
  readonly campaignId: number;
  readonly storeName: string;
  readonly merchantName: string;
  readonly tagline: string;
  readonly imageUrl: string;
  readonly locationKey?: string | null;
  readonly locationName: string;
  readonly rollTableId?: number | null;
  readonly rollTableName: string;
  readonly isUnlocked: boolean;
  readonly isAtCurrentLocation: boolean;
  readonly hasVisited: boolean;
  readonly pastPurchasesCount: number;
  readonly inventoryCount: number;
  readonly merchantType?: string;
  readonly standing?: number;
}

export interface LwMerchantDetailVm {
  readonly id: number;
  readonly campaignId: number;
  readonly storeName: string;
  readonly merchantName: string;
  readonly tagline: string;
  readonly description: string;
  readonly greeting: string;
  readonly imageUrl: string;
  readonly bannerUrl: string;
  readonly locationKey?: string | null;
  readonly locationName: string;
  readonly npcKey?: string | null;
  readonly npcName: string;
  readonly rollTableId?: number | null;
  readonly rollTableName: string;
  readonly buyRatePercent: number;
  readonly markupPercent: number;
  readonly isUnlocked: boolean;
  readonly isAtCurrentLocation: boolean;
  readonly pastPurchasesCount: number;
  readonly merchantType?: string;
  readonly standing?: number;
  readonly npcDetailsJson?: string | null;
  readonly npc?: LwMerchantNpcVm | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LwMerchantInventoryItemVm {
  readonly id: number;
  readonly merchantId: number;
  readonly itemKey: string;
  readonly name: string;
  readonly itemType: string;
  readonly rarity: string;
  readonly description: string;
  readonly baseValueGp: number;
  readonly priceGp: number;
  readonly quantity: number;
  readonly isFeatured: boolean;
  readonly propertiesJson?: string | null;
}

export interface LwMerchantTransactionVm {
  readonly id: number;
  readonly merchantId: number;
  readonly campaignId: number;
  readonly characterKey: string;
  readonly characterName: string;
  readonly transactionType: 'buy' | 'sell';
  readonly itemName: string;
  readonly quantity: number;
  readonly unitPriceGp: number;
  readonly totalGp: number;
  readonly usedPartyFunds: boolean;
  readonly createdAt: string;
}

export interface LwWalletVm {
  readonly personalGoldGp: number;
  readonly personalSilverSp: number;
  readonly personalCopperCp: number;
  readonly partyGoldGp: number;
  readonly partySilverSp: number;
  readonly partyCopperCp: number;
}

export interface LwCampaignRollTableVm {
  readonly id: number;
  readonly campaignId: number;
  readonly rollTableId: number;
  readonly tableName: string;
  readonly sourceBook: string;
  readonly sessionId?: string | null;
  readonly sessionTitle: string;
  readonly encounterId?: string | null;
  readonly encounterTitle?: string;
  readonly merchantId?: number | null;
  readonly merchantName: string;
  readonly notes?: string | null;
  readonly isPinned: boolean;
  readonly createdAt: string;
}

export interface LwCharacterInventoryItemVm {
  readonly id: string;
  readonly name: string;
  readonly slot?: string;
  readonly summary?: string;
  readonly valueGp?: number;
  readonly rarity?: string;
  readonly equipped?: boolean;
}

@Injectable({ providedIn: 'root' })
export class MerchantsApiService {
  private readonly http = inject(HttpClient);

  listMerchants(campaignId: number, characterKey?: string): Observable<readonly LwMerchantSummaryVm[]> {
    const params = characterKey ? `?characterKey=${encodeURIComponent(characterKey)}` : '';
    return this.http.get<readonly LwMerchantSummaryVm[]>(`/api/v2/campaigns/${campaignId}/merchants${params}`);
  }

  getMerchant(campaignId: number, merchantId: number, characterKey?: string): Observable<LwMerchantDetailVm> {
    const params = characterKey ? `?characterKey=${encodeURIComponent(characterKey)}` : '';
    return this.http.get<LwMerchantDetailVm>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}${params}`);
  }

  createMerchant(campaignId: number, payload: Partial<LwMerchantDetailVm>): Observable<LwMerchantDetailVm> {
    return this.http.post<LwMerchantDetailVm>(`/api/v2/campaigns/${campaignId}/merchants`, payload);
  }

  generateRandomMerchant(campaignId: number, payload: {
    merchantType?: string;
    populateInventory: boolean;
    locationName?: string;
    locationKey?: string;
  }): Observable<LwMerchantDetailVm> {
    return this.http.post<LwMerchantDetailVm>(`/api/v2/campaigns/${campaignId}/merchants/generate-random`, payload);
  }

  generateRandomNpc(campaignId: number, merchantId: number, merchantType?: string): Observable<LwMerchantDetailVm> {
    return this.http.post<LwMerchantDetailVm>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/generate-npc`, { merchantType });
  }

  applyTableInventory(campaignId: number, merchantId: number, rollTableId: number, clearExisting = false): Observable<{
    success: boolean;
    itemsAdded: number;
    merchantName: string;
    message: string;
    inventory?: readonly LwMerchantInventoryItemVm[];
  }> {
    return this.http.post<{
      success: boolean;
      itemsAdded: number;
      merchantName: string;
      message: string;
      inventory?: readonly LwMerchantInventoryItemVm[];
    }>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/apply-table-inventory`, { rollTableId, clearExisting });
  }

  adjustStanding(campaignId: number, merchantId: number, delta: number): Observable<{ standingAdjusted: number }> {
    return this.http.post<{ standingAdjusted: number }>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/standing`, delta);
  }

  updateMerchant(campaignId: number, merchantId: number, payload: Partial<LwMerchantDetailVm>): Observable<LwMerchantDetailVm> {
    return this.http.put<LwMerchantDetailVm>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}`, payload);
  }

  deleteMerchant(campaignId: number, merchantId: number): Observable<void> {
    return this.http.delete<void>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}`);
  }

  listInventory(campaignId: number, merchantId: number): Observable<readonly LwMerchantInventoryItemVm[]> {
    return this.http.get<readonly LwMerchantInventoryItemVm[]>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/inventory`);
  }

  addInventoryItem(campaignId: number, merchantId: number, payload: Partial<LwMerchantInventoryItemVm>): Observable<{ id: number; message: string }> {
    return this.http.post<{ id: number; message: string }>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/inventory`, payload);
  }

  updateInventoryItem(campaignId: number, merchantId: number, inventoryId: number, payload: Partial<LwMerchantInventoryItemVm>): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/inventory/${inventoryId}`, payload);
  }

  deleteInventoryItem(campaignId: number, merchantId: number, inventoryId: number): Observable<void> {
    return this.http.delete<void>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/inventory/${inventoryId}`);
  }

  getWallet(campaignId: number, merchantId: number, characterKey?: string): Observable<LwWalletVm> {
    const params = characterKey ? `?characterKey=${encodeURIComponent(characterKey)}` : '';
    return this.http.get<LwWalletVm>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/wallet${params}`);
  }

  updateWallet(campaignId: number, merchantId: number, characterKey: string, payload: { personalGoldGp: number; partyGoldGp: number }): Observable<LwWalletVm> {
    return this.http.post<LwWalletVm>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/wallet?characterKey=${encodeURIComponent(characterKey)}`, payload);
  }

  buyItem(campaignId: number, merchantId: number, payload: {
    inventoryItemId: number; quantity: number; usePartyFunds: boolean; characterKey: string; characterName?: string;
  }): Observable<{ success: boolean; message: string; wallet?: LwWalletVm }> {
    return this.http.post<{ success: boolean; message: string; wallet?: LwWalletVm }>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/buy`, payload);
  }

  sellItem(campaignId: number, merchantId: number, payload: {
    itemKey: string; itemName: string; itemType?: string; rarity?: string; description?: string;
    baseValueGp: number; quantity: number; depositToParty: boolean; characterKey: string; characterName?: string;
  }): Observable<{ success: boolean; message: string; wallet?: LwWalletVm }> {
    return this.http.post<{ success: boolean; message: string; wallet?: LwWalletVm }>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/sell`, payload);
  }

  restockFromTable(campaignId: number, merchantId: number, payload: { numberOfItems: number; clearExisting: boolean }): Observable<{ itemsAdded: number; inventory: readonly LwMerchantInventoryItemVm[] }> {
    return this.http.post<{ itemsAdded: number; inventory: readonly LwMerchantInventoryItemVm[] }>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/restock`, payload);
  }

  listTransactions(campaignId: number, merchantId: number): Observable<readonly LwMerchantTransactionVm[]> {
    return this.http.get<readonly LwMerchantTransactionVm[]>(`/api/v2/campaigns/${campaignId}/merchants/${merchantId}/transactions`);
  }

  listCampaignRollTables(campaignId: number): Observable<readonly LwCampaignRollTableVm[]> {
    return this.http.get<readonly LwCampaignRollTableVm[]>(`/api/v2/campaigns/${campaignId}/campaign-roll-tables`);
  }

  attachRollTable(campaignId: number, payload: {
    rollTableId: number; tableName?: string; sourceBook?: string;
    sessionId?: string; sessionTitle?: string; encounterId?: string; encounterTitle?: string;
    merchantId?: number; merchantName?: string; notes?: string;
  }): Observable<{ id: number; message: string }> {
    return this.http.post<{ id: number; message: string }>(`/api/v2/campaigns/${campaignId}/campaign-roll-tables`, payload);
  }

  removeRollTableAttachment(campaignId: number, id: number): Observable<void> {
    return this.http.delete<void>(`/api/v2/campaigns/${campaignId}/campaign-roll-tables/${id}`);
  }

  getCharacterItems(campaignId: number, characterKey: string): Observable<readonly LwCharacterInventoryItemVm[]> {
    return this.http.get<readonly LwCharacterInventoryItemVm[]>(`/api/v2/campaigns/${campaignId}/characters/${characterKey}/items`);
  }
}
