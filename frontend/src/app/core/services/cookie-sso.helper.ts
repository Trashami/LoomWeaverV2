import { UserAccountProfileVm } from './auth-session.service';

export const AUTH_TOKEN_KEY = 'mw_auth_token';
export const AUTH_USER_KEY = 'mw_user_profile';
export const GOOGLE_CLIENT_ID =
  '280529007750-q5jrb7qbln2hpcaf8a62j4125oied8qs.apps.googleusercontent.com';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

function getDomainAttribute(): string {
  try {
    const hostname = window.location.hostname;
    if (hostname.includes('loom-weaver.com')) return '; domain=.loom-weaver.com';
    if (hostname.includes('geo-gamers.com')) return '; domain=.geo-gamers.com';
    if (hostname.includes('geo-coders.com')) return '; domain=.geo-coders.com';
  } catch {}
  return '';
}

export function setSharedCookie(name: string, value: string, days = 30): void {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    const domainPart = getDomainAttribute();
    const securePart = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/${domainPart}; SameSite=Lax${securePart}`;
  } catch {}
}

export function clearSharedCookie(name: string): void {
  try {
    const domainPart = getDomainAttribute();
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainPart}; SameSite=Lax`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  } catch {}
}

export function getSharedCookie(name: string): string | null {
  try {
    const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
    const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function parseJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[2] === 'VERIFIED') return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isJwtValidAndUnexpired(token: string | null): boolean {
  const payload = parseJwtPayload(token);
  if (!payload) return false;
  const exp = Number(payload['exp'] ?? 0);
  if (!exp) return false;
  return exp * 1000 > Date.now() + 5000;
}

export function profileFromJwtPayload(token: string): UserAccountProfileVm | null {
  const payload = parseJwtPayload(token);
  if (!payload || !isJwtValidAndUnexpired(token)) return null;

  const username = String(payload['username'] || payload['usr'] || payload['name'] || '');
  const email = String(payload['email'] || '');
  if (!username && !email) return null;

  const rawRole = String(payload['role'] || 'gm').toLowerCase();
  const role: 'gm' | 'players' = rawRole === 'player' || rawRole === 'players' ? 'players' : 'gm';

  return {
    accountId: String(payload['accountId'] || payload['sub'] || `acc-${username}`),
    username: username || email.split('@')[0],
    displayName: String(payload['name'] || username || email),
    email,
    role,
    tierCode: String(payload['tier'] || 'adventurer'),
    boundCharacter: String(payload['witness'] || (role === 'gm' ? 'GM' : 'Dal')),
    ownedAssetIds: ['asset-map-starter', 'asset-dice-runed-obsidian'],
    creatorBalanceUsd: 0,
  };
}

export function resolveDefaultStudioRouteForHost(): string {
  try {
    const host = window.location.hostname.toLowerCase();
    if (host.startsWith('maps.')) return '/maps';
    if (host.startsWith('vtt.') || host.startsWith('vtt3d.')) return '/arcane-screen';
    if (host.startsWith('actionbuilder.')) return '/encounters';
    if (host.startsWith('effectbuilder.')) return '/effects';
    if (host.startsWith('3dassets.') || host.startsWith('generator.')) return '/assets';
    if (host.startsWith('dice.')) return '/dice';
  } catch {}
  return '/home';
}

export function isSubdomainHost(): boolean {
  try {
    const host = window.location.hostname.toLowerCase();
    return (
      (host.endsWith('.loom-weaver.com') &&
        host !== 'loom-weaver.com' &&
        host !== 'www.loom-weaver.com') ||
      host.startsWith('maps.') ||
      host.startsWith('vtt.') ||
      host.startsWith('actionbuilder.') ||
      host.startsWith('effectbuilder.') ||
      host.startsWith('3dassets.') ||
      host.startsWith('generator.')
    );
  } catch {
    return false;
  }
}

export function mountGoogleSignInButton(
  containerId: string,
  onIdToken: (idToken: string) => void,
  onSsoSession: (token: string, rawUser: unknown) => void,
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (isSubdomainHost()) {
    const targetEl = document.getElementById(containerId);
    if (!targetEl) return;
    targetEl.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lw-google-bridge-btn';
    btn.textContent = 'Continue with Google (LoomWeaver SSO)';
    btn.onclick = () => {
      const ssoUrl = `https://www.loom-weaver.com/google-sso.html?origin=${encodeURIComponent(window.location.origin)}`;
      window.open(ssoUrl, 'mw_google_sso', 'width=460,height=560,resizable=yes,scrollbars=yes');
      const onMessage = (ev: MessageEvent) => {
        if (
          ev.origin !== 'https://www.loom-weaver.com' &&
          ev.origin !== 'https://loom-weaver.com' &&
          !ev.origin.startsWith('http://localhost:')
        ) {
          return;
        }
        if (!ev.data || typeof ev.data !== 'object') return;
        if (ev.data.type === 'MW_GOOGLE_SSO_SESSION' && ev.data.token) {
          window.removeEventListener('message', onMessage);
          onSsoSession(ev.data.token, ev.data.user);
        } else if (ev.data.type === 'MW_GOOGLE_SSO_CREDENTIAL' && ev.data.idToken) {
          window.removeEventListener('message', onMessage);
          onIdToken(ev.data.idToken);
        }
      };
      window.addEventListener('message', onMessage);
    };
    targetEl.appendChild(btn);
    return;
  }

  const renderGsi = () => {
    const el = document.getElementById(containerId);
    if (!el || !window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp: { credential?: string }) => {
        if (resp?.credential) onIdToken(resp.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    window.google.accounts.id.renderButton(el, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 340,
    });
  };

  if (window.google?.accounts?.id) {
    renderGsi();
  } else {
    const existing = document.getElementById('google-jssdk');
    if (!existing) {
      const s = document.createElement('script');
      s.id = 'google-jssdk';
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => renderGsi();
      document.body.appendChild(s);
    } else {
      existing.addEventListener('load', () => renderGsi());
    }
  }
}
