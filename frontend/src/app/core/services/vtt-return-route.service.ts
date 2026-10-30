import { Injectable, inject, signal } from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs";

const VTT_PATH_PREFIX = "/arcane-screen";
const FALLBACK_RETURN_URL = "/home";

@Injectable({ providedIn: "root" })
export class VttReturnRouteService {
  private readonly router = inject(Router);

  /** Last in-app URL the user visited before entering the VTT screen. */
  readonly returnUrl = signal<string>(FALLBACK_RETURN_URL);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const url = event.urlAfterRedirects || event.url;
        if (!isVttPath(url)) this.returnUrl.set(url);
      });
  }

  returnToPreviousPage(): void {
    void this.router.navigateByUrl(this.returnUrl());
  }
}

export function isVttPath(url: string): boolean {
  const clean = url.split("?")[0].split("#")[0];
  return clean === VTT_PATH_PREFIX || clean.startsWith(`${VTT_PATH_PREFIX}/`);
}
