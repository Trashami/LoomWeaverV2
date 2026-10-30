import type { VttRealtimeEvent } from '../../../core/services/table-realtime-sync.service';
import type { VttFogMode } from '../models/vtt-battle.models';
import { VTT_FOG_MODES } from './vtt-battle-state.service';

export type VttRemoteEvent =
  | { readonly kind: 'token_moved'; readonly key: string; readonly x: number; readonly z: number }
  | { readonly kind: 'turn_changed'; readonly activeKey: string; readonly round: number }
  | {
      readonly kind: 'effect_cast';
      readonly presetId: string;
      readonly startX: number;
      readonly startZ: number;
      readonly endX: number;
      readonly endZ: number;
      readonly targetKeys: readonly string[];
    }
  | { readonly kind: 'fog_changed'; readonly mode: VttFogMode }
  | { readonly kind: 'handout_revealed'; readonly title: string; readonly body: string };

type Payload = Readonly<Record<string, unknown>>;

function parsePayload(json: string): Payload | null {
  try {
    const value: unknown = JSON.parse(json);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Payload) : null;
  } catch {
    return null;
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function stringList(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every(isString) ? (value as readonly string[]) : null;
}

/** Validates a relayed VTT event; malformed or unknown events return null and are ignored. */
export function parseVttEvent(evt: VttRealtimeEvent): VttRemoteEvent | null {
  const p = parsePayload(evt.payloadJson);
  if (!p) return null;
  switch (evt.type) {
    case 'token_moved':
      return isString(p['key']) && isNumber(p['x']) && isNumber(p['z'])
        ? { kind: 'token_moved', key: p['key'], x: p['x'], z: p['z'] }
        : null;
    case 'turn_changed':
      return isString(p['activeKey']) && isNumber(p['round'])
        ? { kind: 'turn_changed', activeKey: p['activeKey'], round: p['round'] }
        : null;
    case 'effect_cast': {
      const targetKeys = stringList(p['targetKeys'] ?? []);
      return isString(p['presetId']) && isNumber(p['startX']) && isNumber(p['startZ']) &&
        isNumber(p['endX']) && isNumber(p['endZ']) && targetKeys
        ? {
            kind: 'effect_cast',
            presetId: p['presetId'],
            startX: p['startX'],
            startZ: p['startZ'],
            endX: p['endX'],
            endZ: p['endZ'],
            targetKeys,
          }
        : null;
    }
    case 'fog_changed': {
      const mode = p['mode'];
      return VTT_FOG_MODES.includes(mode as VttFogMode)
        ? { kind: 'fog_changed', mode: mode as VttFogMode }
        : null;
    }
    case 'handout_revealed':
      return typeof p['title'] === 'string' && typeof p['body'] === 'string'
        ? { kind: 'handout_revealed', title: p['title'], body: p['body'] }
        : null;
    default:
      return null;
  }
}
