import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type LwIconTone = 'inherit' | 'emerald' | 'gold' | 'crimson' | 'muted';

/**
 * Maps LoomWeaver semantic icon identifiers to Angular Material Icons ligatures.
 * Note: Star / AI sparkle icons ('sparkles', 'auto_awesome', 'star', 'stars') are
 * strictly prohibited by design policy and intentionally mapped to non-star glyphs.
 */
const MATERIAL_ICON_MAP: Readonly<Record<string, string>> = {
  home: 'home',
  house: 'home',
  dashboard: 'dashboard',
  bookmark: 'bookmark',
  landmark: 'account_balance',
  users: 'group',
  'user-plus': 'person_add',
  'key-round': 'vpn_key',
  crown: 'workspace_premium',
  compass: 'explore',
  globe: 'public',
  public: 'public',
  map: 'map',
  shield: 'shield',
  'shield-check': 'verified_user',
  swords: 'gavel',
  dices: 'casino',
  'table-chart': 'table_chart',
  zap: 'bolt',
  layers: 'layers',
  'shopping-bag': 'shopping_bag',
  'shopping-cart': 'shopping_cart',
  store: 'storefront',
  'bar-chart': 'bar_chart',
  'bar-chart-3': 'bar_chart',
  chart: 'timeline',
  'book-open': 'menu_book',
  'menu-book': 'menu_book',
  book: 'menu_book',
  'scroll-text': 'menu_book',
  library: 'library_books',
  'history-edu': 'history_edu',
  scroll: 'description',
  backpack: 'backpack',
  skull: 'pets',
  'calendar-days': 'event',
  'clock-3': 'timeline',
  'gamepad-2': 'sports_esports',
  'monitor-play': 'desktop_windows',
  monitor: 'desktop_windows',
  wrench: 'build',
  network: 'hub',
  hub: 'hub',
  database: 'storage',
  music: 'volume_up',
  search: 'search',
  eye: 'visibility',
  'eye-off': 'visibility_off',
  lock: 'lock',
  unlock: 'lock_open',
  check: 'check',
  'arrow-right': 'arrow_forward',
  'arrow-forward': 'arrow_forward',
  'external-link': 'open_in_new',
  'chevron-down': 'expand_more',
  'chevron-up': 'expand_less',
  'chevron-right': 'chevron_right',
  'chevron-left': 'chevron_left',
  'panel-right-close': 'keyboard_double_arrow_right',
  'panel-right-open': 'keyboard_double_arrow_left',
  'double-arrow-left': 'keyboard_double_arrow_left',
  'double-arrow-right': 'keyboard_double_arrow_right',
  'zoom-in': 'zoom_in',
  'zoom-out': 'zoom_out',
  'alert-triangle': 'warning_amber',
  apps: 'apps',
  menu: 'menu',
  x: 'close',
  close: 'close',
  plus: 'add',
  minus: 'remove',
  'more-horizontal': 'more_horiz',
  'more-vertical': 'more_vert',
  'play-filled': 'play_arrow',
  play: 'play_arrow',
  pause: 'pause',
  grid: 'grid_on',
  ruler: 'straighten',
  maximize: 'open_in_full',
  'open-in-full': 'open_in_full',
  send: 'send',
  cursor: 'near_me',
  pen: 'edit',
  target: 'my_location',
  note: 'sticky_note_2',
  link: 'link',
  wand: 'architecture',
  trash: 'delete_outline',
  copy: 'content_copy',
  download: 'download',
  upload: 'upload',
  filter: 'tune',
  settings: 'settings',
  undo: 'undo',
  redo: 'redo',
  save: 'save',
  export: 'ios_share',
  'arrow-left': 'arrow_back',
  'arrow-up': 'arrow_upward',
  calendar: 'event',
  clock: 'schedule',
  'map-pin': 'place',
  'file-text': 'description',
  user: 'person',
  'alert-circle': 'error_outline',
  info: 'info',
  bell: 'notifications_none',
  help: 'help_outline',
  cube: 'view_in_ar',
  pipette: 'colorize',
  // Explicitly redirect any legacy star/sparkle names to a non-star glyph
  sparkles: 'menu_book',
  star: 'bookmark_border',
  stars: 'bookmark_border',
  'auto-awesome': 'menu_book',
};

@Component({
  selector: 'lw-icon',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
})
export class LwIconComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(16);
  readonly tone = input<LwIconTone>('inherit');
  readonly framed = input<boolean>(false);

  readonly materialLigature = computed(() => {
    const raw = (this.name() || '').trim();
    if (!raw) return 'circle';
    const kebab = raw
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
    const mapped = MATERIAL_ICON_MAP[kebab];
    if (mapped) {
      return mapped.toLowerCase();
    }
    return raw.replace(/-/g, '_').toLowerCase();
  });
}

export { LwIconComponent as IconComponent };
