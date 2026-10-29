import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { LwAlertifyService } from './lw-alertify.service';
import { AuthSessionService } from './auth-session.service';
import { LoomWeaverStoreService } from './loomweaver-store.service';

const PENDING_JOIN_KEY = 'lw_pending_join_token_v1';

export interface CreatedInvite {
  readonly id: number;
  readonly inviteCode: string;
  readonly inviteUrl: string;
  readonly role: string;
  readonly maxUses: number;
  readonly expiresInDays: number;
}

/** Campaign create / invite / join against the server membership tables. */
@Injectable({ providedIn: 'root' })
export class CampaignMembershipService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthSessionService);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly alertify = inject(LwAlertifyService);

  readonly joinStatus = signal<string | null>(null);
  private redeemInProgress = false;

  constructor() {
    this.capturePendingJoinFromUrl();
    effect(() => {
      if (this.auth.isAuthenticated()) this.redeemPending();
    });
  }

  createCampaign(name: string, systemCode: string, subtitle = ''): void {
    this.http.post<{ id: number }>('/api/v2/campaigns', { name, systemCode, subtitle }).subscribe({
      next: (res) => this.store.loadMyCampaigns(res.id),
      error: () => this.joinStatus.set('The campaign could not be created.'),
    });
  }

  createInvite(campaignId: number, role: 'player' | 'spectator' = 'player') {
    return this.http.post<CreatedInvite>(`/api/v2/campaigns/${campaignId}/invites`, { role });
  }

  private capturePendingJoinFromUrl(): void {
    if (typeof window === 'undefined') return;
    const token = new URLSearchParams(window.location.search).get('join');
    if (!token) return;
    try {
      sessionStorage.setItem(PENDING_JOIN_KEY, token);
    } catch {
      this.joinStatus.set('The invite code could not be saved in this browser.');
      this.alertify.notifyStatus('Campaign invite', 'Join failed', 'This browser could not store the invite code.', 'crimson');
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('join');
    window.history.replaceState({}, '', url.toString());
  }

  private redeemPending(): void {
    if (this.redeemInProgress) return;
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(PENDING_JOIN_KEY);
    } catch {}
    if (!token) return;

    this.redeemInProgress = true;
    this.http.post<{ campaignId: number }>('/api/v2/invites/redeem', { token }).subscribe({
      next: (res) => {
        this.redeemInProgress = false;
        this.clearPending();
        this.joinStatus.set('You joined the campaign.');
        this.alertify.notifyStatus('Campaign invite', 'Joined campaign', 'Campaign access is ready.', 'emerald');
        this.store.loadMyCampaigns(res.campaignId);
      },
      error: () => {
        this.redeemInProgress = false;
        this.clearPending();
        this.joinStatus.set('That invite is invalid, expired or used up.');
        this.alertify.notifyStatus('Campaign invite', 'Join failed', 'The invite is invalid, expired or used up.', 'crimson');
      },
    });
  }

  private clearPending(): void {
    try {
      sessionStorage.removeItem(PENDING_JOIN_KEY);
    } catch {}
  }
}
