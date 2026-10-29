import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const APP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    data: { seoPage: 'home' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'vtt',
    data: { seoPage: 'vtt' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'campaign-manager',
    data: { seoPage: 'campaign-manager' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'battlemap-builder',
    data: { seoPage: 'battlemap-builder' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'effect-builder',
    data: { seoPage: 'effect-builder' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'encounter-builder',
    data: { seoPage: 'encounter-builder' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: '3d-assets',
    data: { seoPage: '3d-assets' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'ai-campaign-assistant',
    data: { seoPage: 'ai-campaign-assistant' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'features',
    data: { seoPage: 'features' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  { path: 'about', data: { seoPage: 'about' }, loadComponent: () => import('./features/landing/landing.page').then(m => m.LandingPageComponent) },
  {
    path: 'welcome',
    data: { seoPage: 'home' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'marketing',
    data: { seoPage: 'home' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'login',
    data: { seoPage: 'login' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'register',
    data: { seoPage: 'register' },
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'features/:slug',
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/home/home.page').then((m) => m.HomePageComponent),
  },
  {
    path: 'campaigns',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/campaigns/campaigns.page').then((m) => m.CampaignsPageComponent),
  },
  {
    path: 'characters',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/characters/characters.page').then((m) => m.CharactersPageComponent),
  },
  {
    path: 'maps',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/maps/maps.page').then((m) => m.MapsPageComponent),
  },
  {
    path: 'arcane-screen',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/arcane-screen/arcane-screen.page').then(
        (m) => m.ArcaneScreenPageComponent,
      ),
  },
  {
    path: 'encounters',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/encounters/encounters.page').then((m) => m.EncountersPageComponent),
  },
  {
    path: 'dice',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dice/dice.page').then((m) => m.DicePageComponent),
  },
  {
    path: 'effects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/effects/effects.page').then((m) => m.EffectsPageComponent),
  },
  {
    path: 'assets',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/assets/assets.page').then((m) => m.AssetsPageComponent),
  },
  {
    path: 'marketplace',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/marketplace/marketplace.page').then(
        (m) => m.MarketplacePageComponent,
      ),
  },
  {
    path: 'statistics',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/statistics/statistics.page').then((m) => m.StatisticsPageComponent),
  },
  {
    path: 'bestiary',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/bestiary/bestiary.page').then((m) => m.BestiaryPageComponent),
  },
  {
    path: 'decks',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/decks/decks.page').then((m) => m.DecksPageComponent),
  },
  {
    path: 'decks/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/decks/decks.page').then((m) => m.DecksPageComponent),
  },
  {
    path: 'loom',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/loom/loom.page').then((m) => m.LoomPageComponent),
  },
  {
    path: 'weave',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/weave/weave.page').then((m) => m.WeavePageComponent),
  },
  {
    path: 'world-lore',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/weave/weave.page').then((m) => m.WeavePageComponent),
  },
  // Protected legacy route redirects
  { path: 'dashboard', redirectTo: 'home', pathMatch: 'full' },
  { path: 'dm-game', redirectTo: 'arcane-screen', pathMatch: 'full' },
  { path: 'player-game', redirectTo: 'arcane-screen', pathMatch: 'full' },
  { path: 'loom-graph', redirectTo: 'weave', pathMatch: 'full' },
  { path: 'quests', redirectTo: 'campaigns', pathMatch: 'full' },
  { path: 'notes', redirectTo: 'loom', pathMatch: 'full' },
  { path: 'locations', redirectTo: 'weave', pathMatch: 'full' },
  { path: 'npcs', redirectTo: 'campaigns', pathMatch: 'full' },
  { path: 'monsters', redirectTo: 'bestiary', pathMatch: 'full' },
  { path: 'spells', redirectTo: 'effects', pathMatch: 'full' },
  { path: 'items', canActivate: [authGuard], loadComponent: () => import('./features/items/items.page').then(m => m.ItemsPageComponent) },
  { path: '**', redirectTo: '' },
];
