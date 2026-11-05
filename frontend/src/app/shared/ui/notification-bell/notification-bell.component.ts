import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwNotificationCategory, LwNotificationItemVm } from '../../../core/models/loomweaver.models';
import { LwNotificationService } from '../../../core/services/lw-notification.service';
import { LwIconComponent } from '../icon/icon.component';

@Component({
  selector: 'lw-notification-bell',
  standalone: true,
  imports: [NgpButton, LwIconComponent],
  template: `
    <div class="lw-notif-bell-wrap">
      <button
        ngpButton
        type="button"
        class="lw-notif-bell__trigger"
        [class.lw-notif-bell__trigger--open]="notifications.drawerOpen()"
        [class.lw-notif-bell__trigger--has-unread]="notifications.unreadCount() > 0"
        [attr.aria-expanded]="notifications.drawerOpen()"
        aria-haspopup="dialog"
        aria-label="Campaign & Character Notifications"
        title="Notifications & Campaign Invites"
        (click)="notifications.toggleDrawer()"
      >
        <lw-icon name="bell" [size]="18" />
        @if (notifications.unreadCount() > 0) {
          <span class="lw-notif-bell__badge" aria-label="Unread notifications">
            {{ notifications.unreadCount() > 99 ? '99+' : notifications.unreadCount() }}
          </span>
        }
      </button>

      @if (notifications.drawerOpen()) {
        <section class="lw-notif-popover" role="dialog" aria-label="Notifications">
          <header class="lw-notif-popover__head">
            <div class="lw-notif-popover__title-group">
              <span class="lw-notif-popover__kicker">CAMPAIGN ALERTS & INVITES</span>
              <h3 class="lw-notif-popover__title">
                Notifications
                @if (notifications.unreadCount() > 0) {
                  <span class="lw-notif-popover__unread-pill">{{ notifications.unreadCount() }} Unread</span>
                }
              </h3>
            </div>
            <div class="lw-notif-popover__head-actions">
              @if (notifications.unreadCount() > 0) {
                <button ngpButton type="button" class="lw-notif-popover__mark-all" (click)="notifications.markAllRead()">
                  Mark All Read
                </button>
              }
            </div>
          </header>

          <div class="lw-notif-popover__filters" role="tablist">
            @for (tab of filterTabs; track tab.id) {
              <button
                ngpButton
                type="button"
                class="lw-notif-popover__filter-chip"
                [class.lw-notif-popover__filter-chip--active]="notifications.activeCategoryFilter() === tab.id"
                (click)="notifications.activeCategoryFilter.set(tab.id)"
              >
                {{ tab.label }}
              </button>
            }
          </div>

          <div class="lw-notif-popover__list">
            @for (item of notifications.visibleNotifications(); track item.id) {
              <article
                class="lw-notif-card"
                [class.lw-notif-card--unread]="!item.isRead"
                [class.lw-notif-card--invite]="item.category === 'campaign_invite'"
              >
                <div class="lw-notif-card__top">
                  <span class="lw-notif-card__cat" [attr.data-cat]="item.category">
                    {{ categoryLabel(item.category) }}
                  </span>
                  <span class="lw-notif-card__meta">
                    {{ item.campaignName || 'LoomWeaver' }} · {{ formatTimeAgo(item.createdAt) }}
                  </span>
                </div>
                <h4 class="lw-notif-card__title">{{ item.title }}</h4>
                <p class="lw-notif-card__msg">{{ item.message }}</p>
                <div class="lw-notif-card__foot">
                  <button
                    ngpButton
                    type="button"
                    class="lw-notif-card__action-btn"
                    [class.lw-notif-card__action-btn--primary]="item.category === 'campaign_invite' || !item.isRead"
                    (click)="notifications.activateNotification(item)"
                  >
                    {{ item.actionLabel || 'Open' }}
                  </button>
                  @if (!item.isRead) {
                    <button
                      ngpButton
                      type="button"
                      class="lw-notif-card__dismiss-btn"
                      (click)="notifications.markRead(item.id)"
                    >
                      Mark Read
                    </button>
                  }
                </div>
              </article>
            } @empty {
              <div class="lw-notif-popover__empty">
                <strong>No notifications in this view</strong>
                <span>Campaign invites, player joins, upcoming live sessions, level-ups, loot awards, and published notes appear here.</span>
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: stretch;
      position: relative;
    }
    .lw-notif-bell-wrap {
      position: relative;
      display: flex;
      align-items: stretch;
    }
    .lw-notif-bell__trigger {
      position: relative;
      width: 52px;
      min-height: 62px;
      border: none;
      border-left: 1px solid rgba(217, 183, 122, 0.16);
      background: transparent;
      color: #c7d4ce;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 140ms ease, color 140ms ease;
    }
    .lw-notif-bell__trigger:hover,
    .lw-notif-bell__trigger--open {
      background: rgba(24, 58, 42, 0.68);
      color: #49e892;
    }
    .lw-notif-bell__trigger--has-unread {
      color: #f3e7cb;
    }
    .lw-notif-bell__badge {
      position: absolute;
      top: 12px;
      right: 9px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: linear-gradient(135deg, #2ee66b, #19a94a);
      color: #04130b;
      font-size: 0.66rem;
      font-weight: 800;
      line-height: 18px;
      text-align: center;
      border: 1.5px solid #08130f;
      box-shadow: 0 0 10px rgba(46, 230, 107, 0.55);
      pointer-events: none;
    }
    .lw-notif-popover {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      width: 410px;
      max-width: calc(100vw - 24px);
      background: linear-gradient(180deg, #0b1813 0%, #060f0c 100%);
      border: 1px solid rgba(217, 183, 122, 0.42);
      border-radius: 10px;
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.85), 0 0 22px rgba(46, 230, 107, 0.16);
      z-index: 200;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .lw-notif-popover__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 0.95rem;
      background: rgba(4, 11, 8, 0.95);
      border-bottom: 1px solid rgba(217, 183, 122, 0.2);
    }
    .lw-notif-popover__kicker {
      display: block;
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #d9b77a;
    }
    .lw-notif-popover__title {
      margin: 0.12rem 0 0;
      font-family: var(--lw-font-display, Georgia, serif);
      font-size: 0.96rem;
      color: #f4e8cd;
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .lw-notif-popover__unread-pill {
      font-family: var(--lw-font-sans, sans-serif);
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.12rem 0.45rem;
      border-radius: 999px;
      background: rgba(46, 230, 107, 0.18);
      border: 1px solid rgba(46, 230, 107, 0.45);
      color: #49e892;
    }
    .lw-notif-popover__mark-all {
      padding: 0.3rem 0.6rem;
      border-radius: 5px;
      border: 1px solid rgba(217, 183, 122, 0.3);
      background: rgba(16, 34, 26, 0.85);
      color: #e6d7b8;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
    }
    .lw-notif-popover__mark-all:hover {
      border-color: #49e892;
      color: #49e892;
    }
    .lw-notif-popover__filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      padding: 0.5rem 0.85rem;
      background: rgba(7, 16, 13, 0.92);
      border-bottom: 1px solid rgba(217, 183, 122, 0.14);
    }
    .lw-notif-popover__filter-chip {
      padding: 0.22rem 0.52rem;
      border-radius: 999px;
      border: 1px solid rgba(217, 183, 122, 0.2);
      background: rgba(12, 24, 19, 0.8);
      color: #a9bdb3;
      font-size: 0.66rem;
      font-weight: 600;
      cursor: pointer;
    }
    .lw-notif-popover__filter-chip--active {
      background: rgba(46, 230, 107, 0.18);
      border-color: #49e892;
      color: #49e892;
    }
    .lw-notif-popover__list {
      max-height: 390px;
      overflow-y: auto;
      padding: 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.48rem;
    }
    .lw-notif-card {
      padding: 0.68rem 0.78rem;
      border-radius: 8px;
      border: 1px solid rgba(217, 183, 122, 0.16);
      background: rgba(11, 23, 18, 0.82);
      display: flex;
      flex-direction: column;
      gap: 0.32rem;
    }
    .lw-notif-card--unread {
      border-color: rgba(73, 232, 146, 0.45);
      background: linear-gradient(135deg, rgba(16, 40, 29, 0.92), rgba(10, 22, 17, 0.94));
    }
    .lw-notif-card--invite {
      border-color: rgba(217, 183, 122, 0.65);
      box-shadow: inset 0 0 14px rgba(217, 183, 122, 0.1);
    }
    .lw-notif-card__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
    }
    .lw-notif-card__cat {
      font-size: 0.6rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.12rem 0.42rem;
      border-radius: 4px;
      background: rgba(217, 183, 122, 0.15);
      color: #e9cf99;
    }
    .lw-notif-card__cat[data-cat="campaign_invite"] {
      background: rgba(217, 183, 122, 0.26);
      color: #ffe3a8;
    }
    .lw-notif-card__cat[data-cat="player_joined"],
    .lw-notif-card__cat[data-cat="session_upcoming"] {
      background: rgba(46, 230, 107, 0.18);
      color: #49e892;
    }
    .lw-notif-card__meta {
      font-size: 0.64rem;
      color: #8fa59a;
    }
    .lw-notif-card__title {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 700;
      color: #f4e8cd;
    }
    .lw-notif-card__msg {
      margin: 0;
      font-size: 0.73rem;
      line-height: 1.38;
      color: #bdd0c6;
    }
    .lw-notif-card__foot {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin-top: 0.22rem;
    }
    .lw-notif-card__action-btn {
      padding: 0.32rem 0.68rem;
      border-radius: 5px;
      border: 1px solid rgba(217, 183, 122, 0.32);
      background: rgba(18, 38, 29, 0.9);
      color: #f3e7cb;
      font-size: 0.71rem;
      font-weight: 700;
      cursor: pointer;
    }
    .lw-notif-card__action-btn--primary {
      background: linear-gradient(135deg, rgba(46, 230, 107, 0.24), rgba(22, 92, 52, 0.55));
      border-color: #49e892;
      color: #49e892;
    }
    .lw-notif-card__dismiss-btn {
      padding: 0.28rem 0.52rem;
      border-radius: 5px;
      border: 1px solid transparent;
      background: transparent;
      color: #8fa59a;
      font-size: 0.68rem;
      cursor: pointer;
    }
    .lw-notif-card__dismiss-btn:hover {
      color: #f3e7cb;
    }
    .lw-notif-popover__empty {
      padding: 1.5rem 1rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      color: #9ab0a5;
      font-size: 0.74rem;
    }
    .lw-notif-popover__empty strong {
      color: #e6d7b8;
      font-size: 0.82rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwNotificationBellComponent {
  readonly notifications = inject(LwNotificationService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly filterTabs: readonly { id: 'all' | LwNotificationCategory; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'campaign_invite', label: 'Invites' },
    { id: 'player_joined', label: 'Party' },
    { id: 'session_upcoming', label: 'Sessions' },
    { id: 'level_up', label: 'Level Up' },
    { id: 'item_received', label: 'Loot & Items' },
    { id: 'note_published', label: 'Notes' },
  ];

  categoryLabel(cat: LwNotificationCategory): string {
    switch (cat) {
      case 'campaign_invite': return 'Campaign Invite';
      case 'player_joined': return 'Player Joined';
      case 'session_upcoming': return 'Upcoming Session';
      case 'level_up': return 'Level Up';
      case 'loot_awarded':
      case 'item_received': return 'Loot & Items';
      case 'note_published': return 'Published Note';
      default: return 'Alert';
    }
  }

  formatTimeAgo(iso: string): string {
    if (!iso) return 'Just now';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.notifications.toggleDrawer(false);
    }
  }
}
