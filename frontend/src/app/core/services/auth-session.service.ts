import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  clearSharedCookie,
  getSharedCookie,
  isJwtValidAndUnexpired,
  mountGoogleSignInButton,
  profileFromJwtPayload,
  resolveDefaultStudioRouteForHost,
  setSharedCookie,
} from './cookie-sso.helper';
import { LoomWeaverStoreService } from './loomweaver-store.service';
import { TableRealtimeSyncService } from './table-realtime-sync.service';

export interface UserAccountProfileVm {
  readonly accountId: string;
  readonly username: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: 'gm' | 'players';
  readonly tierCode: string;
  readonly boundCharacter: string;
  readonly ownedAssetIds: readonly string[];
  readonly creatorBalanceUsd: number;
}

export interface StripeSettlementVm {
  readonly sessionId: string;
  readonly paymentStatus: string;
  readonly itemId: string;
  readonly itemTitle: string;
  readonly grossAmountUsd: number;
  readonly creatorTransferUsd: number;
  readonly platformFeeUsd: number;
  readonly creatorHandle: string;
  readonly receiptNumber: string;
  readonly settledAt: string;
}

const DEFAULT_FALLBACK_PROFILE: UserAccountProfileVm = {
  accountId: 'unauthenticated',
  username: 'guest',
  displayName: 'Sign In Required',
  email: '',
  role: 'players',
  tierCode: 'free',
  boundCharacter: 'None',
  ownedAssetIds: [],
  creatorBalanceUsd: 0,
};

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly realtime = inject(TableRealtimeSyncService);

  readonly accounts = signal<readonly UserAccountProfileVm[]>([]);
  readonly currentUserProfile = signal<UserAccountProfileVm | null>(null);
  readonly activeAccountId = signal<string>('');
  readonly jwtToken = signal<string>('');
  readonly settlements = signal<readonly StripeSettlementVm[]>([]);

  readonly authModalOpen = signal<boolean>(false);
  readonly authModalTab = signal<'login' | 'register' | 'request'>('login');
  readonly authLoading = signal<boolean>(false);
  readonly authError = signal<string>('');
  readonly authNotice = signal<string>('');
  readonly pendingReturnUrl = signal<string>('');

  readonly isAuthenticated = computed(
    () => isJwtValidAndUnexpired(this.jwtToken()) && this.currentUserProfile() !== null,
  );

  readonly activeProfile = computed(
    () => this.currentUserProfile() ?? DEFAULT_FALLBACK_PROFILE,
  );

  constructor() {
    this.restoreSharedSession();
    if (typeof window !== 'undefined') {
      window.addEventListener('lw:unauthorized', () => this.logout());
    }
  }

  private restoreSharedSession(): void {
    try {
      const storedToken =
        (typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null) ||
        getSharedCookie(AUTH_TOKEN_KEY);

      if (!storedToken || !isJwtValidAndUnexpired(storedToken)) {
        this.clearLocalAndCookieState();
        return;
      }

      const decoded = profileFromJwtPayload(storedToken);
      if (!decoded) {
        this.clearLocalAndCookieState();
        return;
      }

      this.jwtToken.set(storedToken);
      this.currentUserProfile.set(decoded);
      this.activeAccountId.set(decoded.accountId);
      this.store.syncUserIdentity(decoded.accountId, decoded.username);
      setSharedCookie(AUTH_TOKEN_KEY, storedToken);

      this.loadAuthenticatedResources();
    } catch {
      this.clearLocalAndCookieState();
    }
  }

  private loadAuthenticatedResources(): void {
    if (!this.isAuthenticated()) return;

    this.http.get<readonly UserAccountProfileVm[]>('/api/v2/auth/accounts').subscribe({
      next: (res) => {
        if (res?.length) this.accounts.set(res);
      },
      error: () => {},
    });

    this.http.get<readonly StripeSettlementVm[]>('/api/v2/marketplace/settlements').subscribe({
      next: (res) => {
        if (res?.length) this.settlements.set(res);
      },
      error: () => {},
    });
  }

  openAuthModal(tab: 'login' | 'register' | 'request' = 'login', returnUrl?: string): void {
    this.authModalTab.set(tab);
    this.authError.set('');
    this.authNotice.set('');
    if (returnUrl) {
      this.pendingReturnUrl.set(returnUrl);
    }
    this.authModalOpen.set(true);
  }

  closeAuthModal(): void {
    this.authModalOpen.set(false);
    this.authError.set('');
  }

  initGoogleButton(containerId: string): void {
    mountGoogleSignInButton(
      containerId,
      (idToken) => this.loginWithGoogle(idToken),
      (token, rawUser) => {
        const profile = profileFromJwtPayload(token);
        if (profile) {
          this.establishAuthenticatedSession(token, profile, rawUser);
        }
      },
    );
  }

  loginWithCredentials(identifier: string, password: string): void {
    const cleanId = identifier.trim();
    if (!cleanId || !password) {
      this.authError.set('Please enter both your email/username and password.');
      return;
    }

    this.authLoading.set(true);
    this.authError.set('');

    this.http
      .post<{ token: string; profile: UserAccountProfileVm; user?: unknown }>('/api/v2/auth/login', {
        identifier: cleanId,
        accountId: cleanId,
        password,
        passwordOrPin: password,
      })
      .subscribe({
        next: (res) => {
          this.authLoading.set(false);
          if (!res?.token || !res?.profile) {
            this.authError.set('Authentication failed. Invalid server response.');
            return;
          }
          this.establishAuthenticatedSession(res.token, res.profile, res.user);
        },
        error: (err: HttpErrorResponse) => {
          this.authLoading.set(false);
          this.authError.set(
            err.status === 401
              ? 'Invalid email/username or password.'
              : err.error?.message || 'Sign in failed. Please check your credentials.',
          );
        },
      });
  }

  loginWithGoogle(idToken: string): void {
    this.authLoading.set(true);
    this.authError.set('');

    this.http
      .post<{ token: string; profile: UserAccountProfileVm; user?: unknown }>('/api/v2/auth/google', {
        idToken,
      })
      .subscribe({
        next: (res) => {
          this.authLoading.set(false);
          if (res?.token && res?.profile) {
            this.establishAuthenticatedSession(res.token, res.profile, res.user);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.authLoading.set(false);
          this.authError.set(err.error?.message || 'Google Sign-In failed.');
        },
      });
  }

  registerAccount(
    email: string,
    username: string,
    displayName: string,
    password: string,
  ): void {
    const trimmedEmail = email.trim();
    const trimmedUser = username.trim() || trimmedEmail.split('@')[0];
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      this.authError.set('Enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      this.authError.set('Password must be at least 6 characters.');
      return;
    }

    this.authLoading.set(true);
    this.authError.set('');

    this.http
      .post<{ token: string; profile: UserAccountProfileVm; user?: unknown }>('/api/v2/auth/register', {
        email: trimmedEmail,
        username: trimmedUser,
        displayName: displayName.trim() || trimmedUser,
        password,
      })
      .subscribe({
        next: (res) => {
          this.authLoading.set(false);
          if (res?.token && res?.profile) {
            this.establishAuthenticatedSession(res.token, res.profile, res.user);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.authLoading.set(false);
          this.authError.set(err.error?.message || 'Could not create account.');
        },
      });
  }

  requestAccountAccess(email: string, username: string, displayName: string, notes: string): void {
    if (!email.trim() || !username.trim()) {
      this.authError.set('Email address and desired username are required.');
      return;
    }
    this.authLoading.set(true);
    this.authError.set('');
    this.http
      .post<{ success: boolean; message: string }>('/api/v2/auth/request-account', {
        email: email.trim(),
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        notes: notes.trim(),
      })
      .subscribe({
        next: (res) => {
          this.authLoading.set(false);
          this.authNotice.set(res?.message || 'Your access request has been submitted.');
        },
        error: (err: HttpErrorResponse) => {
          this.authLoading.set(false);
          this.authError.set(err.error?.message || 'Failed to submit access request.');
        },
      });
  }

  loginAsAccount(accountId: string): void {
    if (!this.isAuthenticated()) {
      this.openAuthModal('login');
      return;
    }
    const found = this.accounts().find((a) => a.accountId === accountId);
    if (found) {
      this.currentUserProfile.set(found);
      this.activeAccountId.set(found.accountId);
      this.store.syncUserIdentity(found.accountId, found.username);
    }
  }

  logout(): void {
    this.http.post('/api/v2/auth/logout', {}).subscribe({ error: () => {} });
    this.clearLocalAndCookieState();
    this.realtime.refreshPresence();
    void this.router.navigateByUrl('/welcome');
  }

  executeStripeCheckout(
    itemId: string,
    itemTitle: string,
    creatorHandle: string,
    priceUsd: number,
  ): void {
    if (!this.isAuthenticated()) {
      this.openAuthModal('login');
      return;
    }
    const profile = this.activeProfile();
    this.http
      .post<StripeSettlementVm>('/api/v2/marketplace/checkout', {
        accountId: profile.accountId,
        itemId,
        itemTitle,
        creatorHandle,
        priceUsd,
      })
      .subscribe({
        next: (settlement) => {
          this.settlements.update((prev) => [settlement, ...prev]);
          this.realtime.refreshPresence();
        },
        error: () => {},
      });
  }

  private establishAuthenticatedSession(
    token: string,
    profile: UserAccountProfileVm,
    rawUser?: unknown,
  ): void {
    this.jwtToken.set(token);
    this.currentUserProfile.set(profile);
    this.activeAccountId.set(profile.accountId);
    this.store.syncUserIdentity(profile.accountId, profile.username);

    try {
      const userJson = JSON.stringify(rawUser ?? profile);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        localStorage.setItem(AUTH_USER_KEY, userJson);
      }
      setSharedCookie(AUTH_TOKEN_KEY, token, 30);
      setSharedCookie(AUTH_USER_KEY, userJson, 30);
    } catch {}

    this.closeAuthModal();
    this.loadAuthenticatedResources();
    this.realtime.refreshPresence();

    const targetUrl = this.pendingReturnUrl() || resolveDefaultStudioRouteForHost();
    this.pendingReturnUrl.set('');
    void this.router.navigateByUrl(targetUrl);
  }

  private clearLocalAndCookieState(): void {
    this.jwtToken.set('');
    this.currentUserProfile.set(null);
    this.activeAccountId.set('');
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        localStorage.removeItem('lw_auth_active_v2');
        localStorage.removeItem('lw_auth_jwt_v2');
      }
      clearSharedCookie(AUTH_TOKEN_KEY);
      clearSharedCookie(AUTH_USER_KEY);
    } catch {}
  }
}
