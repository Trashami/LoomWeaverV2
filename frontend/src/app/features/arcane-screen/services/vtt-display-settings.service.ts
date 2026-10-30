import { Injectable, signal } from '@angular/core';

export type VttMapQuality = 'performance' | 'balanced' | 'visual';

export interface VttMapQualityOption {
  readonly id: VttMapQuality;
  readonly label: string;
  readonly hint: string;
}

export const VTT_MAP_QUALITY_OPTIONS: readonly VttMapQualityOption[] = [
  { id: 'performance', label: 'Performance', hint: 'Low-resolution map art. Best for older hardware and slow connections.' },
  { id: 'balanced', label: 'Balanced', hint: 'Medium-resolution map art. A good default for most devices.' },
  { id: 'visual', label: 'Visual', hint: 'Full-resolution map art for the best look.' },
];

/** Asset file suffix per quality; visual uses the base file. */
const QUALITY_SUFFIX: Readonly<Record<VttMapQuality, string>> = {
  performance: '-low',
  balanced: '-mid',
  visual: '',
};

const STORAGE_KEY = 'lw.vtt.mapQuality';

/** Inserts a quality suffix before the file extension, keeping any query string. */
export function mapVariantUrl(baseUrl: string, suffix: string): string {
  if (!suffix) return baseUrl;
  return baseUrl.replace(/(\.[a-z0-9]+)(\?.*)?$/i, `${suffix}$1$2`);
}

@Injectable({ providedIn: 'root' })
export class VttDisplaySettingsService {
  readonly mapQuality = signal<VttMapQuality>(readStoredQuality());

  /** Variant URLs that failed to load; those fall back to the base image. */
  private readonly failedVariants = signal<ReadonlySet<string>>(new Set());
  private readonly probed = new Set<string>();

  setMapQuality(quality: VttMapQuality): void {
    this.mapQuality.set(quality);
    try {
      localStorage.setItem(STORAGE_KEY, quality);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this session.
    }
  }

  /** Returns the map art URL for the selected quality, falling back to the full-resolution base image. */
  backdropUrl(baseUrl: string | null | undefined): string {
    if (!baseUrl) return '';
    const variant = mapVariantUrl(baseUrl, QUALITY_SUFFIX[this.mapQuality()]);
    if (variant === baseUrl) return baseUrl;
    if (this.failedVariants().has(variant)) return baseUrl;
    this.probe(variant);
    return variant;
  }

  private probe(url: string): void {
    if (this.probed.has(url) || typeof Image === 'undefined') return;
    this.probed.add(url);
    const img = new Image();
    img.onerror = () => this.failedVariants.update((set) => new Set([...set, url]));
    img.src = url;
  }
}

function readStoredQuality(): VttMapQuality {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return VTT_MAP_QUALITY_OPTIONS.some((o) => o.id === raw) ? (raw as VttMapQuality) : 'balanced';
  } catch {
    return 'balanced';
  }
}
