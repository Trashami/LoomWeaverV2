import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LwAlertifyService } from './lw-alertify.service';
import { LoomWeaverStoreService } from './loomweaver-store.service';

export interface TablePresenceSeatVm {
  readonly seatId: string;
  readonly displayName: string;
  readonly role: string;
  readonly boundCharacter: string;
  readonly status: string;
  readonly activeRoute: string;
  readonly latencyMs: number;
}

export interface TableRealtimeEventVm {
  readonly eventId: string;
  readonly campaignId: number;
  readonly eventType: string;
  readonly actorName: string;
  readonly summary: string;
  readonly payloadJson: string;
  readonly timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class TableRealtimeSyncService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly alertify = inject(LwAlertifyService);
  private readonly authenticated = signal(false);
  private connection: HubConnection | null = null;
  private connectedCampaignId = 0;
  private connectionGeneration = 0;

  readonly seats = signal<readonly TablePresenceSeatVm[]>([]);
  readonly recentEvents = signal<readonly TableRealtimeEventVm[]>([]);
  readonly syncProtocolLabel = signal<string>('Disconnected');
  /** Increments whenever the server reports combat or token changes; consumers re-fetch from the API. */
  readonly combatTick = signal(0);

  constructor() {
    effect(() => {
      const campaignId = this.store.activeCampaignId();
      if (this.authenticated() && campaignId > 0) void this.connectToCampaign(campaignId);
      else void this.disconnect();
    });
  }

  refreshPresence(): void {
    const hasToken =
      typeof localStorage !== 'undefined' && !!localStorage.getItem('mw_auth_token');
    this.authenticated.set(hasToken);
    if (!hasToken) {
      this.seats.set([]);
      this.recentEvents.set([]);
      return;
    }

    const campaignId = this.store.activeCampaignId();
    if (campaignId <= 0) return;
    this.http
      .get<{
        seats: readonly TablePresenceSeatVm[];
        recentEvents: readonly TableRealtimeEventVm[];
      }>(`/api/v2/campaigns/${campaignId}/realtime/presence`)
      .subscribe({
        next: (res) => {
          this.seats.set(res.seats ?? []);
          this.recentEvents.set(res.recentEvents ?? []);
        },
        error: () => this.alertify.notifyStatus(
          'Live table', 'Presence unavailable', 'Campaign presence could not be loaded.', 'crimson',
        ),
      });
  }

  publishTableEvent(eventType: string, actorName: string, summary: string, payload: unknown = {}): void {
    const campaignId = this.store.activeCampaignId();
    const connection = this.connection;
    if (!connection || this.connectedCampaignId !== campaignId) {
      this.alertify.notifyStatus('Live table', 'Not connected', 'Reconnect to the campaign table before sending events.', 'crimson');
      return;
    }

    void connection.invoke('BroadcastTableAction', campaignId, {
      eventType,
      actorName,
      summary,
      payloadJson: JSON.stringify(payload),
    }).catch(() => {
      this.alertify.notifyStatus('Live table', 'Send failed', 'The event was not sent to the server.', 'crimson');
    });
  }

  private async connectToCampaign(campaignId: number): Promise<void> {
    if (this.connectedCampaignId === campaignId && this.connection?.state === HubConnectionState.Connected) return;
    const generation = ++this.connectionGeneration;
    await this.stopConnection();
    if (generation !== this.connectionGeneration) return;

    const connection = new HubConnectionBuilder()
      .withUrl('/hubs/table')
      .withAutomaticReconnect()
      .build();
    this.connection = connection;
    this.connectedCampaignId = campaignId;
    connection.on('TableEventReceived', (evt: TableRealtimeEventVm) => {
      if (evt.campaignId === this.store.activeCampaignId()) this.appendEventLocally(evt);
    });
    connection.on('CombatStateChanged', () => this.combatTick.update((n) => n + 1));
    connection.onreconnecting(() => this.syncProtocolLabel.set('Reconnecting'));
    connection.onreconnected(async () => {
      try {
        await connection.invoke('JoinCampaignTable', campaignId, '', '');
        this.syncProtocolLabel.set('Connected with SignalR');
        this.refreshPresence();
      } catch {
        this.syncProtocolLabel.set('Reconnect failed');
      }
    });
    connection.onclose(() => this.syncProtocolLabel.set('Disconnected'));

    try {
      await connection.start();
      if (generation !== this.connectionGeneration) {
        await connection.stop();
        return;
      }
      await connection.invoke('JoinCampaignTable', campaignId, '', '');
      this.syncProtocolLabel.set('Connected with SignalR');
      this.refreshPresence();
    } catch {
      if (generation === this.connectionGeneration) {
        this.connectedCampaignId = 0;
        this.syncProtocolLabel.set('SignalR connection failed');
        this.alertify.notifyStatus('Live table', 'Connection failed', 'The live campaign connection could not be established.', 'crimson');
      }
    }
  }

  private async disconnect(): Promise<void> {
    this.connectionGeneration++;
    this.connectedCampaignId = 0;
    this.seats.set([]);
    await this.stopConnection();
    this.syncProtocolLabel.set('Disconnected');
  }

  private async stopConnection(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.stop();
  }

  private appendEventLocally(evt: TableRealtimeEventVm): void {
    this.recentEvents.update((prev) =>
      [evt, ...prev.filter((e) => e.eventId !== evt.eventId)].slice(0, 30),
    );
  }
}
