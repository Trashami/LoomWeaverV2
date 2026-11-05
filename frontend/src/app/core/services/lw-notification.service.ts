import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { LwNotificationCategory, LwNotificationItemVm } from '../models/loomweaver.models';

export interface PendingCampaignInviteModalVm {
  readonly campaignId: number;
  readonly campaignName: string;
  readonly systemLabel: string;
  readonly dmName: string;
  readonly notificationId?: string;
}

const LOCAL_NOTIF_STORAGE_KEY = 'lw_user_notifications_v2';
const DISMISSED_INVITE_PROMPTS_KEY = 'lw_dismissed_invite_prompts_v2';

function readLocalNotifications(): readonly LwNotificationItemVm[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_NOTIF_STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalNotifications(list: readonly LwNotificationItemVm[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_NOTIF_STORAGE_KEY, JSON.stringify(list.slice(0, 60)));
    }
  } catch {}
}

@Injectable({ providedIn: 'root' })
export class LwNotificationService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly notifications = signal<readonly LwNotificationItemVm[]>(readLocalNotifications());
  readonly drawerOpen = signal<boolean>(false);
  readonly pendingInviteModal = signal<PendingCampaignInviteModalVm | null>(null);
  readonly activeCategoryFilter = signal<'all' | LwNotificationCategory>('all');

  private readonly currentUsername = signal<string>('');
  private readonly currentEmail = signal<string>('');
  private readonly activeCampaignIds = signal<readonly number[]>([]);
  private dismissedPromptIds = new Set<number>();

  readonly visibleNotifications = computed<readonly LwNotificationItemVm[]>(() => {
    const uname = this.currentUsername().trim().toLowerCase();
    const email = this.currentEmail().trim().toLowerCase();
    const campIds = new Set(this.activeCampaignIds());
    const catFilter = this.activeCategoryFilter();

    return this.notifications().filter((n) => {
      const recU = (n.recipientUsername || '').trim().toLowerCase();
      const recE = (n.recipientEmail || '').trim().toLowerCase();
      const matchesRecipient =
        !uname ||
        recU === '*' ||
        recU === uname ||
        (email && recE === email) ||
        (recE && recE.split('@')[0] === uname);
      if (!matchesRecipient) return false;
      if (recU === '*' && n.campaignId > 0 && campIds.size > 0 && !campIds.has(n.campaignId)) {
        return false;
      }
      if (catFilter !== 'all' && n.category !== catFilter) return false;
      return true;
    });
  });

  readonly unreadCount = computed<number>(() =>
    this.visibleNotifications().filter((n) => !n.isRead).length
  );

  constructor() {
    try {
      const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DISMISSED_INVITE_PROMPTS_KEY) : null;
      if (raw) {
        const ids: number[] = JSON.parse(raw);
        ids.forEach((id) => this.dismissedPromptIds.add(id));
      }
    } catch {}
  }

  syncIdentityAndRefresh(username: string, email: string, campaignIds: readonly number[]): void {
    this.currentUsername.set(username);
    this.currentEmail.set(email);
    this.activeCampaignIds.set(campaignIds);
    this.refreshFromServer();
  }

  refreshFromServer(): void {
    this.http.get<readonly LwNotificationItemVm[]>('/api/v2/notifications').subscribe({
      next: (serverItems) => {
        const local = readLocalNotifications();
        const byId = new Map<string, LwNotificationItemVm>();
        for (const item of serverItems ?? []) {
          byId.set(item.id, item);
        }
        for (const item of local) {
          if (!byId.has(item.id)) {
            byId.set(item.id, item);
          } else {
            const srv = byId.get(item.id)!;
            if (item.isRead && !srv.isRead) {
              byId.set(item.id, { ...srv, isRead: true });
            }
          }
        }
        const merged = Array.from(byId.values()).sort((a, b) => {
          if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        this.notifications.set(merged);
        writeLocalNotifications(merged);
        this.checkAutoOpenPendingInviteModal(merged);
      },
      error: () => {
        const local = readLocalNotifications();
        this.notifications.set(local);
        this.checkAutoOpenPendingInviteModal(local);
      },
    });
  }

  toggleDrawer(open?: boolean): void {
    const next = open !== undefined ? open : !this.drawerOpen();
    this.drawerOpen.set(next);
    if (next) {
      this.refreshFromServer();
    }
  }

  openInviteJoinModal(modal: PendingCampaignInviteModalVm): void {
    this.drawerOpen.set(false);
    this.pendingInviteModal.set(modal);
  }

  dismissInviteJoinModal(): void {
    const cur = this.pendingInviteModal();
    if (cur) {
      this.dismissedPromptIds.add(cur.campaignId);
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(DISMISSED_INVITE_PROMPTS_KEY, JSON.stringify(Array.from(this.dismissedPromptIds)));
        }
      } catch {}
    }
    this.pendingInviteModal.set(null);
  }

  markRead(id: string): void {
    this.notifications.update((list) => {
      const next = list.map((n) => (n.id === id ? { ...n, isRead: true } : n));
      writeLocalNotifications(next);
      return next;
    });
    this.http.post(`/api/v2/notifications/${encodeURIComponent(id)}/read`, {}).subscribe({ error: () => {} });
  }

  markAllRead(): void {
    this.notifications.update((list) => {
      const next = list.map((n) => ({ ...n, isRead: true }));
      writeLocalNotifications(next);
      return next;
    });
    this.http.post('/api/v2/notifications/read-all', {}).subscribe({ error: () => {} });
  }

  activateNotification(item: LwNotificationItemVm): void {
    this.markRead(item.id);
    this.drawerOpen.set(false);
    if (item.category === 'campaign_invite' && item.campaignId > 0) {
      this.openInviteJoinModal({
        campaignId: item.campaignId,
        campaignName: item.campaignName || `Campaign #${item.campaignId}`,
        systemLabel: 'D&D 5e (2024)',
        dmName: item.actorName || 'Dungeon Master',
        notificationId: item.id,
      });
      return;
    }
    if (item.routeLink) {
      const [path, query] = item.routeLink.split('?');
      if (query) {
        const params: Record<string, string> = {};
        new URLSearchParams(query).forEach((v, k) => (params[k] = v));
        void this.router.navigate([path], { queryParams: params });
      } else {
        void this.router.navigateByUrl(item.routeLink);
      }
    }
  }

  pushNotification(req: {
    id?: string;
    recipientUsername?: string;
    recipientEmail?: string;
    campaignId: number;
    campaignName: string;
    category: LwNotificationCategory;
    title: string;
    message: string;
    routeLink?: string;
    actionLabel?: string;
    actorName?: string;
    broadcastToCampaign?: boolean;
  }): void {
    const id = req.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const item: LwNotificationItemVm = {
      id,
      recipientUsername: req.broadcastToCampaign ? '*' : (req.recipientUsername || '*'),
      recipientEmail: req.recipientEmail || '',
      campaignId: req.campaignId,
      campaignName: req.campaignName,
      category: req.category,
      title: req.title,
      message: req.message,
      routeLink: req.routeLink || '/home',
      actionLabel: req.actionLabel || 'Open',
      actorName: req.actorName || this.currentUsername() || 'LoomWeaver',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    this.notifications.update((list) => {
      const next = [item, ...list.filter((n) => n.id !== id)];
      writeLocalNotifications(next);
      return next;
    });

    this.http.post('/api/v2/notifications', {
      recipientUsername: item.recipientUsername,
      recipientEmail: item.recipientEmail,
      campaignId: item.campaignId,
      campaignName: item.campaignName,
      category: item.category,
      title: item.title,
      message: item.message,
      routeLink: item.routeLink,
      actionLabel: item.actionLabel,
      actorName: item.actorName,
      broadcastToCampaign: req.broadcastToCampaign ?? item.recipientUsername === '*',
    }).subscribe({ error: () => {} });
  }

  notifyCampaignInviteSent(campaignId: number, campaignName: string, targetUsername: string, targetDisplayName: string, dmName: string): void {
    this.pushNotification({
      id: `invite-camp-${campaignId}-${targetUsername.toLowerCase()}`,
      recipientUsername: targetUsername,
      campaignId,
      campaignName,
      category: 'campaign_invite',
      title: `Campaign Invite: ${campaignName}`,
      message: `${dmName} invited ${targetDisplayName} (@${targetUsername}) to join ${campaignName}. Select an existing character or create a new character to join.`,
      routeLink: `/home?joinCampaign=${campaignId}`,
      actionLabel: 'Join & Choose Character',
      actorName: dmName,
    });
  }

  notifyPlayerJoinedCampaign(campaignId: number, campaignName: string, playerUsername: string, playerDisplayName: string, characterName: string): void {
    const inviteId = `invite-camp-${campaignId}-${playerUsername.toLowerCase()}`;
    this.markRead(inviteId);
    this.pushNotification({
      id: `joined-${campaignId}-${playerUsername.toLowerCase()}-${Date.now()}`,
      campaignId,
      campaignName,
      category: 'player_joined',
      title: `${playerDisplayName} Joined ${campaignName}`,
      message: `${playerDisplayName} (@${playerUsername}) joined ${campaignName} with character ${characterName}.`,
      routeLink: '/home',
      actionLabel: 'View Party Roster',
      actorName: playerDisplayName,
      broadcastToCampaign: true,
    });
  }

  notifyUpcomingSessionLive(campaignId: number, campaignName: string, sessionTitle: string, locationLabel: string): void {
    this.pushNotification({
      campaignId,
      campaignName,
      category: 'session_upcoming',
      title: `Upcoming Session Planned: ${sessionTitle}`,
      message: `${sessionTitle} (${locationLabel}) is now scheduled and ready to go live in ${campaignName}.`,
      routeLink: '/sessions',
      actionLabel: 'Open Session Chronicle',
      broadcastToCampaign: true,
    });
  }

  notifyCharacterLevelUp(campaignId: number, campaignName: string, characterName: string, newLevel: number, ownerUsername?: string): void {
    this.pushNotification({
      recipientUsername: ownerUsername || '*',
      campaignId,
      campaignName,
      category: 'level_up',
      title: `Level Up: ${characterName} Reached Level ${newLevel}`,
      message: `${characterName} advanced to Level ${newLevel} in ${campaignName}. Review updated HP, spell slots, and class features.`,
      routeLink: '/characters',
      actionLabel: 'Open Character Sheet',
      broadcastToCampaign: !ownerUsername,
    });
  }

  notifyLootOrItemAwarded(campaignId: number, campaignName: string, characterName: string, itemName: string, ownerUsername?: string): void {
    this.pushNotification({
      recipientUsername: ownerUsername || '*',
      campaignId,
      campaignName,
      category: 'item_received',
      title: `Item Received: ${itemName}`,
      message: `${characterName} received ${itemName} in ${campaignName}. Check inventory and attunement slots.`,
      routeLink: '/characters',
      actionLabel: 'View Inventory',
      broadcastToCampaign: !ownerUsername,
    });
  }

  notifyNoteOrLorePublished(campaignId: number, campaignName: string, noteTitle: string, kindLabel: string, routeLink = '/handouts'): void {
    this.pushNotification({
      campaignId,
      campaignName,
      category: 'note_published',
      title: `New ${kindLabel} Published: ${noteTitle}`,
      message: `${noteTitle} has been published and is now available for players to view in ${campaignName}.`,
      routeLink,
      actionLabel: `View ${kindLabel}`,
      broadcastToCampaign: true,
    });
  }

  private checkAutoOpenPendingInviteModal(list: readonly LwNotificationItemVm[]): void {
    if (this.pendingInviteModal()) return;
    const uname = this.currentUsername().trim().toLowerCase();
    if (!uname) return;
    const pendingInvite = list.find(
      (n) =>
        n.category === 'campaign_invite' &&
        !n.isRead &&
        n.campaignId > 0 &&
        !this.dismissedPromptIds.has(n.campaignId) &&
        ((n.recipientUsername || '').toLowerCase() === uname ||
          (n.recipientEmail || '').toLowerCase().split('@')[0] === uname)
    );
    if (pendingInvite) {
      this.pendingInviteModal.set({
        campaignId: pendingInvite.campaignId,
        campaignName: pendingInvite.campaignName || `Campaign #${pendingInvite.campaignId}`,
        systemLabel: 'D&D 5e (2024)',
        dmName: pendingInvite.actorName || 'Dungeon Master',
        notificationId: pendingInvite.id,
      });
    }
  }
}
