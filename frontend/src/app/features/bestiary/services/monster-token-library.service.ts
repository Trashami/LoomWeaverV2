import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { LwMonsterSummaryVm, LwMonsterTokenOptionVm } from '../../../shared/ui/public-api';
import { VttCombatService } from '../../arcane-screen/services/vtt-combat.service';

interface CatalogAsset {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly modelUrl?: string;
  readonly thumbnailUrl?: string;
}

const STOP_WORDS = new Set([
  'the', 'of', 'and', 'a', 'an', '3d', '2d', 'glb', 'top', 'down', 'token', 'dnd', 'figure', 'v2', 'model', 'male', 'female',
]);

/** Normalized word list used for name matching ("Goblin Scout / Warrior (3D GLB)" -> ["goblin", "scout", "warrior"]). */
export function tokenizeMonsterName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/** 0-100 score for how well a library asset name matches a monster name. */
export function scoreTokenMatch(monsterName: string, assetName: string): number {
  const m = tokenizeMonsterName(monsterName);
  const a = tokenizeMonsterName(assetName);
  if (m.length === 0 || a.length === 0) return 0;
  if (m.join(' ') === a.join(' ')) return 100;
  if (a.join(' ').includes(m.join(' '))) return 85;
  const hits = m.filter((w) => a.some((x) => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x)))));
  return hits.length === 0 ? 0 : Math.round((hits.length / m.length) * 70);
}

/**
 * Token library for monsters: 2D tokens (compendium token art + encounter studio tokens) and 3D models
 * (LoomMaps "Tokens" asset catalog + encounter studio GLBs), ranked by name match for a given monster.
 */
@Injectable({ providedIn: 'root' })
export class MonsterTokenLibraryService {
  private readonly http = inject(HttpClient);
  private readonly vtt = inject(VttCombatService);

  private readonly catalogModels = signal<readonly CatalogAsset[]>([]);
  private catalogRequested = false;

  /** Lazily loads the 3D token models from the shared asset catalog (only the DM token tab needs it). */
  ensureLoaded(): void {
    if (this.catalogRequested) return;
    this.catalogRequested = true;
    this.http.get<{ assets?: CatalogAsset[] }>('/asset-properties-catalog.json').subscribe({
      next: (res) =>
        this.catalogModels.set((res.assets ?? []).filter((a) => a.category === 'Tokens' && !!a.modelUrl)),
      error: () => (this.catalogRequested = false),
    });
  }

  tokenOptionsFor(monster: LwMonsterSummaryVm, knownMonsters: readonly LwMonsterSummaryVm[]): LwMonsterTokenOptionVm[] {
    const options: LwMonsterTokenOptionVm[] = [];
    if (monster.tokenUrl) {
      options.push(this.option(`own-${monster.key}`, monster.name, '2d', monster.tokenUrl, monster.tokenUrl, 'Compendium token', 100));
    }
    if (monster.imageUrl) {
      options.push(this.option(`art-${monster.key}`, `${monster.name} portrait`, '2d', monster.imageUrl, monster.imageUrl, 'Compendium art', 90));
    }
    for (const t of this.vtt.monsterTokenAssets().filter((a) => a.kind === '2d')) {
      options.push(this.option(t.id, t.name, '2d', t.previewUrl, t.previewUrl, 'Encounter tokens', scoreTokenMatch(monster.name, t.name)));
    }
    for (const other of knownMonsters) {
      if (other.key === monster.key || !other.tokenUrl) continue;
      options.push(
        this.option(`tok-${other.key}`, other.name, '2d', other.tokenUrl, other.tokenUrl, 'Compendium token', scoreTokenMatch(monster.name, other.name)),
      );
    }
    return this.rank(options);
  }

  modelOptionsFor(monster: LwMonsterSummaryVm): LwMonsterTokenOptionVm[] {
    const options: LwMonsterTokenOptionVm[] = [];
    for (const a of this.catalogModels()) {
      options.push(this.option(a.id, a.name, '3d', a.thumbnailUrl ?? '', a.modelUrl!, '3D token library', scoreTokenMatch(monster.name, a.name)));
    }
    for (const t of this.vtt.monsterTokenAssets().filter((x) => x.kind === '3d' && !!x.glbUrl)) {
      options.push(this.option(t.id, t.name, '3d', t.previewUrl, t.glbUrl!, 'Encounter models', scoreTokenMatch(monster.name, t.name)));
    }
    return this.rank(options);
  }

  /** Best automatic match (score >= 50) used when the DM has not assigned a token for this campaign. */
  bestTokenFor(monster: LwMonsterSummaryVm): LwMonsterTokenOptionVm | null {
    const best = this.tokenOptionsFor(monster, [])[0];
    return best && best.matchScore >= 50 ? best : null;
  }

  private rank(options: LwMonsterTokenOptionVm[]): LwMonsterTokenOptionVm[] {
    const seen = new Set<string>();
    return options
      .filter((o) => !!o.assetUrl && !seen.has(o.assetUrl) && !!seen.add(o.assetUrl))
      .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
  }

  private option(
    id: string, name: string, kind: '2d' | '3d', previewUrl: string, assetUrl: string, origin: string, matchScore: number,
  ): LwMonsterTokenOptionVm {
    return { id, name, kind, previewUrl, assetUrl, origin, matchScore };
  }
}
