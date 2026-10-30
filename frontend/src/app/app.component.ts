import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { Meta } from "@angular/platform-browser";
import {
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { NgpButton } from "ng-primitives/button";
import { filter } from "rxjs";
import { AuthSessionService } from "./core/services/auth-session.service";
import { CampaignMembershipService } from "./core/services/campaign-membership.service";
import {
  VttReturnRouteService,
  isVttPath,
} from "./core/services/vtt-return-route.service";
import {
  isSubdomainHost,
  resolveDefaultStudioRouteForHost,
} from "./core/services/cookie-sso.helper";
import { LoomWeaverStoreService } from "./core/services/loomweaver-store.service";
import { WebAudioAmbienceService } from "./features/assets/engine/web-audio-ambience.service";
import { LwAppHeaderBarComponent } from "./shared/ui/app-header-bar/app-header-bar.component";
import { LwAlertifyToastStackComponent } from "./shared/ui/alertify-toast-stack/alertify-toast-stack.component";
import { LwAuthModalComponent } from "./shared/ui/auth-modal/auth-modal.component";
import { LwFullscreenDiceOverlayComponent } from "./shared/ui/fullscreen-dice-overlay/fullscreen-dice-overlay.component";
import { LwIconComponent } from "./shared/ui/icon/icon.component";
import { LwInspectorDrawerComponent } from "./shared/ui/inspector-drawer/inspector-drawer.component";
import { LwLoomLauncherComponent } from "./shared/ui/loom-launcher/loom-launcher.component";
import { LwScrollAreaComponent } from "./shared/ui/scroll-area/scroll-area.component";

interface StudioNavItem {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly icon: string;
  readonly exact?: boolean;
}

interface StudioNavGroup {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly items: readonly StudioNavItem[];
}

const FAVORITES_STORAGE_KEY = "lw-sidebar-favorites-v1";
const DEFAULT_FAVORITES = ["session-log", "characters", "maps-scenes"] as const;

const NAV_GROUPS: readonly StudioNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "house",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        route: "/home",
        icon: "house",
        exact: true,
      },
    ],
  },
  {
    id: "campaign",
    label: "Campaign Management",
    icon: "layers",
    items: [
      {
        id: "world-lore",
        label: "World & Lore",
        route: "/world-lore",
        icon: "book-open",
      },
      {
        id: "quests-story",
        label: "Quests & Story",
        route: "/campaigns",
        icon: "scroll-text",
      },
      {
        id: "characters",
        label: "Characters",
        route: "/characters",
        icon: "users",
      },
      { id: "items", label: "Items", route: "/items", icon: "backpack" },
      { id: "bestiary", label: "Bestiary", route: "/bestiary", icon: "skull" },
      {
        id: "maps-scenes",
        label: "Maps & Scenes",
        route: "/maps",
        icon: "map",
      },
      {
        id: "encounters",
        label: "Encounters",
        route: "/encounters",
        icon: "swords",
      },
      // Reuses existing /loom route until a dedicated sessions/chronicles route exists.
      {
        id: "session-log",
        label: "Sessions & Chronicles",
        route: "/loom",
        icon: "calendar-days",
      },
      {
        id: "handouts-clues",
        label: "Handouts & Clues",
        route: "/assets",
        icon: "file-text",
      },
      // Reuses existing /statistics route until a dedicated timelines route exists.
      {
        id: "timelines",
        label: "Timelines",
        route: "/statistics",
        icon: "clock-3",
      },
    ],
  },
  {
    id: "play",
    label: "Play & Creation Tools",
    icon: "gamepad-2",
    items: [
      {
        id: "arcane-vtt",
        label: "Arcane Screen (Live VTT)",
        route: "/arcane-screen",
        icon: "monitor-play",
      },
      {
        id: "dice-forge",
        label: "3D Dice Forge",
        route: "/dice",
        icon: "dices",
      },
      {
        id: "effects-rules",
        label: "Actions & FX Studio",
        route: "/effects",
        icon: "wand",
      },
    ],
  },
  {
    id: "commerce",
    label: "Marketplace",
    icon: "store",
    items: [
      {
        id: "marketplace",
        label: "Creator Marketplace",
        route: "/marketplace",
        icon: "shopping-bag",
      },
      {
        id: "store",
        label: "Store",
        route: "/store",
        icon: "store",
      },
    ],
  },
];

@Component({
  selector: "lw-root",
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgpButton,
    LwAppHeaderBarComponent,
    LwAlertifyToastStackComponent,
    LwAuthModalComponent,
    LwFullscreenDiceOverlayComponent,
    LwIconComponent,
    LwInspectorDrawerComponent,
    LwLoomLauncherComponent,
    LwScrollAreaComponent,
  ],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly auth = inject(AuthSessionService);
  readonly audio = inject(WebAudioAmbienceService);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly membership = inject(CampaignMembershipService);
  // Injected so it starts tracking the last non-VTT route on app boot.
  private readonly vttReturn = inject(VttReturnRouteService);

  readonly currentUrl = signal<string>(this.resolveInitialBrowserPath());
  readonly globalSearchText = signal("");
  readonly leftNavCollapsed = signal(
    this.isFullBleedPath(this.resolveInitialBrowserPath()),
  );
  readonly rightGuideCollapsed = signal(true);

  readonly navGroups = NAV_GROUPS;
  readonly favoritesEditing = signal(false);
  readonly favoriteIds = signal<readonly string[]>(this.loadFavorites());
  readonly collapsedGroups = signal<readonly string[]>([]);

  readonly visibleNavGroups = computed(() =>
    this.navGroups.map((group) => ({
      ...group,
      items:
        group.id === "play" && this.store.weaveEnabled()
          ? [
              ...group.items,
              {
                id: "the-weave",
                label: "The Weave (AI Drafts)",
                route: "/weave",
                icon: "network",
              },
            ]
          : group.items,
    })),
  );

  readonly allNavItems = computed(() =>
    this.visibleNavGroups().flatMap((group) => group.items),
  );
  readonly favorites = computed(() => {
    const items = this.allNavItems();
    return this.favoriteIds()
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is StudioNavItem => item !== undefined);
  });

  readonly isFullBleedVttRoute = computed(() =>
    this.isFullBleedPath(this.currentUrl()),
  );

  // The Arcane Screen runs fullscreen with no app header or left nav.
  readonly isFullscreenVttRoute = computed(() => isVttPath(this.currentUrl()));

  readonly isLandingSurface = computed(() => {
    const clean =
      this.currentUrl().split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
    if (isSubdomainHost() && this.auth.isAuthenticated() && clean === "/")
      return false;
    return (
      clean === "/" ||
      clean === "/welcome" ||
      clean === "/marketing" ||
      clean === "/vtt" ||
      clean === "/campaign-manager" ||
      clean === "/battlemap-builder" ||
      clean === "/ai-campaign-assistant" ||
      clean === "/features" ||
      clean === "/about" ||
      clean === "/effect-builder" ||
      clean === "/encounter-builder" ||
      clean === "/3d-assets" ||
      clean === "/login" ||
      clean === "/register" ||
      clean.startsWith("/features/")
    );
  });

  constructor() {
    void this.membership;
    if (
      typeof window !== "undefined" &&
      isSubdomainHost() &&
      this.auth.isAuthenticated() &&
      (window.location.pathname === "/" || window.location.pathname === "")
    ) {
      const target = resolveDefaultStudioRouteForHost();
      this.currentUrl.set(target);
      void this.router.navigateByUrl(target, { replaceUrl: true });
    }

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationStart | NavigationEnd =>
            event instanceof NavigationStart || event instanceof NavigationEnd,
        ),
      )
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          const nextUrl = event.urlAfterRedirects || event.url;
          this.currentUrl.set(nextUrl);
          if (
            nextUrl.startsWith("/characters") ||
            this.isFullBleedPath(nextUrl)
          ) {
            this.rightGuideCollapsed.set(true);
          }
          if (this.isFullBleedPath(nextUrl)) this.leftNavCollapsed.set(true);
        } else if (event.url && event.url !== "/") {
          this.currentUrl.set(event.url);
        }
        this.meta.updateTag({
          name: "robots",
          content: this.isLandingSurface()
            ? "index, follow"
            : "noindex, nofollow",
        });
      });
  }

  private resolveInitialBrowserPath(): string {
    if (typeof window !== "undefined" && window.location?.pathname) {
      return window.location.pathname + (window.location.search || "");
    }
    return this.router.url || "/";
  }

  private isFullBleedPath(url: string): boolean {
    const clean = url.split("?")[0].split("#")[0];
    return ["/arcane-screen", "/maps", "/dice"].some(
      (prefix) => clean === prefix || clean.startsWith(`${prefix}/`),
    );
  }

  private loadFavorites(): readonly string[] {
    if (typeof window === "undefined") return DEFAULT_FAVORITES;
    try {
      const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) return DEFAULT_FAVORITES;
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : DEFAULT_FAVORITES;
    } catch {
      return DEFAULT_FAVORITES;
    }
  }

  isFavorite(id: string): boolean {
    return this.favoriteIds().includes(id);
  }
  isGroupCollapsed(id: string): boolean {
    return this.collapsedGroups().includes(id);
  }

  toggleGroup(id: string): void {
    this.collapsedGroups.update((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }

  toggleFavorite(id: string): void {
    this.favoriteIds.update((ids) => {
      const next = ids.includes(id)
        ? ids.filter((value) => value !== id)
        : [...ids, id];
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            FAVORITES_STORAGE_KEY,
            JSON.stringify(next),
          );
        } catch {
          /* Storage may be disabled; current session still works. */
        }
      }
      return next;
    });
  }

  toggleLeftNav(): void {
    this.leftNavCollapsed.update((collapsed) => !collapsed);
  }

  submitGlobalSearch(query?: string): void {
    const text = (query ?? this.globalSearchText()).trim();
    if (text) this.store.setLoomSearchQuery(text);
    this.store.toggleLoomDrawer(true);
  }
}
