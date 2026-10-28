import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import {
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { filter } from 'rxjs';
import { AuthSessionService } from './core/services/auth-session.service';
import {
  isSubdomainHost,
  resolveDefaultStudioRouteForHost,
} from './core/services/cookie-sso.helper';
import { LoomWeaverStoreService } from './core/services/loomweaver-store.service';
import { WebAudioAmbienceService } from './features/assets/engine/web-audio-ambience.service';
import { LwAppHeaderBarComponent } from './shared/ui/app-header-bar/app-header-bar.component';
import { LwAlertifyToastStackComponent } from './shared/ui/alertify-toast-stack/alertify-toast-stack.component';
import { LwAuthModalComponent } from './shared/ui/auth-modal/auth-modal.component';
import { LwFullscreenDiceOverlayComponent } from './shared/ui/fullscreen-dice-overlay/fullscreen-dice-overlay.component';
import { LwIconComponent } from './shared/ui/icon/icon.component';
import { LwInspectorDrawerComponent } from './shared/ui/inspector-drawer/inspector-drawer.component';
import { LwLoomLauncherComponent } from './shared/ui/loom-launcher/loom-launcher.component';
import { LwScrollAreaComponent } from './shared/ui/scroll-area/scroll-area.component';

interface StudioPrimaryNavItem {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly icon?: string;
}

@Component({
  selector: 'lw-root',
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
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly auth = inject(AuthSessionService);
  readonly audio = inject(WebAudioAmbienceService);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);

  readonly currentUrl = signal<string>(this.resolveInitialBrowserPath());
  readonly globalSearchText = signal<string>('');
  readonly showAllModules = signal<boolean>(true);
  readonly leftNavCollapsed = signal<boolean>(
    this.resolveInitialBrowserPath().startsWith('/arcane-screen') ||
      this.resolveInitialBrowserPath().startsWith('/maps'),
  );
  readonly rightGuideCollapsed = signal<boolean>(true);

  readonly isFullBleedVttRoute = computed(() => {
    const clean = this.currentUrl().split('?')[0].split('#')[0];
    return (
      clean.startsWith('/arcane-screen') ||
      clean.startsWith('/maps') ||
      clean.startsWith('/dice')
    );
  });

  readonly isLandingSurface = computed(() => {
    const clean = this.currentUrl().split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
    if (isSubdomainHost() && this.auth.isAuthenticated() && (clean === '' || clean === '/')) {
      return false;
    }
    return (
      clean === '' ||
      clean === '/' ||
      clean === '/welcome' ||
      clean === '/marketing' ||
      clean === '/vtt' ||
      clean === '/campaign-manager' ||
      clean === '/battlemap-builder' ||
      clean === '/ai-campaign-assistant' ||
      clean === '/features' ||
      clean === '/about' ||
      clean === '/effect-builder' ||
      clean === '/encounter-builder' ||
      clean === '/3d-assets' ||
      clean === '/login' ||
      clean === '/register' ||
      clean.startsWith('/features/')
    );
  });

  readonly primarySidebarNav: readonly StudioPrimaryNavItem[] = [
    { id: 'dashboard', label: 'Dashboard', route: '/home' },
    { id: 'world-lore', label: 'World & Lore', route: '/world-lore' },
    { id: 'quests-story', label: 'Quests & Story', route: '/campaigns' },
    { id: 'characters', label: 'Characters', route: '/characters' },
    { id: 'items', label: 'Items', route: '/items' },
    { id: 'maps-scenes', label: 'Maps & Scenes', route: '/maps' },
    { id: 'session-log', label: 'Session Log', route: '/loom' },
    { id: 'handouts-clues', label: 'Handouts & Clues', route: '/assets' },
    { id: 'timelines', label: 'Timelines', route: '/statistics' },
  ];

  private readonly baseEngineSidebarNav: readonly StudioPrimaryNavItem[] = [
    { id: 'encounters', label: 'Encounters (Build & Prep)', route: '/encounters' },
    { id: 'arcane-vtt', label: 'Arcane Screen (Live VTT)', route: '/arcane-screen' },
    { id: 'dice-forge', label: '3D Dice Forge', route: '/dice' },
    { id: 'effects-rules', label: 'Actions & FX Studio', route: '/effects' },
    { id: 'marketplace', label: 'Creator Marketplace', route: '/marketplace' },
  ];

  readonly engineSidebarNav = computed<readonly StudioPrimaryNavItem[]>(() => {
    if (!this.store.weaveEnabled()) {
      return this.baseEngineSidebarNav;
    }
    return [
      ...this.baseEngineSidebarNav,
      { id: 'the-weave', label: 'The Weave (AI Drafts)', route: '/weave' },
    ];
  });

  constructor() {
    if (
      typeof window !== 'undefined' &&
      isSubdomainHost() &&
      this.auth.isAuthenticated() &&
      (window.location.pathname === '/' || window.location.pathname === '')
    ) {
      const target = resolveDefaultStudioRouteForHost();
      this.currentUrl.set(target);
      void this.router.navigateByUrl(target, { replaceUrl: true });
    }

    this.router.events
      .pipe(
        filter(
          (e): e is NavigationStart | NavigationEnd =>
            e instanceof NavigationStart || e instanceof NavigationEnd,
        ),
      )
      .subscribe((e) => {
        if (e instanceof NavigationEnd) {
          const nextUrl = e.urlAfterRedirects || e.url;
          this.currentUrl.set(nextUrl);
          if (nextUrl.startsWith('/characters')) {
            this.rightGuideCollapsed.set(true);
          }
          if (nextUrl.startsWith('/dice')) {
            this.leftNavCollapsed.set(false);
            this.rightGuideCollapsed.set(true);
          }
          if (nextUrl.startsWith('/arcane-screen') || nextUrl.startsWith('/maps')) {
            this.leftNavCollapsed.set(true);
            this.rightGuideCollapsed.set(true);
          }
        } else if (e.url && e.url !== '/') {
          this.currentUrl.set(e.url);
        }
        if (!this.isLandingSurface()) {
          this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
        }
      });
  }

  private resolveInitialBrowserPath(): string {
    if (typeof window !== 'undefined' && window.location?.pathname) {
      return window.location.pathname + (window.location.search || '');
    }
    return this.router.url || '/';
  }

  toggleLeftNav(): void {
    this.leftNavCollapsed.update((c) => !c);
  }

  submitGlobalSearch(query?: string): void {
    const q = (query ?? this.globalSearchText()).trim();
    if (q) {
      this.store.setLoomSearchQuery(q);
    }
    this.store.toggleLoomDrawer(true);
  }
}
