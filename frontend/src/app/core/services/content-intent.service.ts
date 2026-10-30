import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import { EncounterDetailVm } from '../../features/encounters/models/encounter-studio.models';
import { LoomWeaverStoreService } from './loomweaver-store.service';

export type ContentVisibility = 'gm' | 'players' | 'public';

export interface ContentIntentField {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly defaultValue?: string;
}

export interface ContentDraft {
  readonly title: string;
  readonly bodyHtml: string;
  readonly bodyText: string;
  readonly visibility: ContentVisibility;
  readonly linkedKeys: readonly string[];
  readonly fields: Readonly<Record<string, string>>;
}

export interface SavedTarget {
  readonly kind: string;
  readonly key: string;
}

export interface ContentIntent {
  readonly key: string;
  readonly label: string;
  readonly summary: string;
  readonly destination: string;
  readonly defaultVisibility: ContentVisibility;
  readonly templateHtml: string;
  readonly prompts: readonly string[];
  readonly fields: readonly ContentIntentField[];
  readonly save: (draft: ContentDraft) => Observable<SavedTarget>;
}

export interface CaptureReceipt {
  readonly captureKey: string;
  readonly compositeKey: string | null;
  readonly linkCount: number;
  readonly graphProjected: boolean;
}

@Injectable({ providedIn: 'root' })
export class ContentIntentService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);

  readonly intents: readonly ContentIntent[] = this.buildIntents();

  find(key: string | null | undefined): ContentIntent | null {
    return this.intents.find((intent) => intent.key === key) ?? null;
  }

  /** Saves through the domain endpoint, then records the capture that links it into the graph. */
  saveAndCapture(intent: ContentIntent, draft: ContentDraft): Observable<CaptureReceipt> {
    const cid = this.store.activeCampaignId();
    return intent.save(draft).pipe(
      switchMap((target) =>
        this.http.post<CaptureReceipt>(`/api/v2/campaigns/${cid}/content-captures`, {
          intent: intent.key,
          templateKey: `${intent.key}-default`,
          targetKind: target.kind,
          targetKey: target.key,
          title: draft.title,
          bodyHtml: draft.bodyHtml,
          bodyText: draft.bodyText,
          visibility: draft.visibility,
          sourceRoute: '/create',
          linkedCompositeKeys: [...draft.linkedKeys],
        }),
      ),
    );
  }

  private buildIntents(): ContentIntent[] {
    const cid = () => this.store.activeCampaignId();
    const role = '?role=gm';

    return [
      {
        key: 'lore',
        label: 'Lore entry',
        summary: 'A piece of world history, place, faction, or myth.',
        destination: 'World Lore: lore entries, with the lore graph node.',
        defaultVisibility: 'players',
        templateHtml: '<h2>Overview</h2><p></p><h2>What players know</h2><p></p><h2>What only the GM knows</h2><p></p>',
        prompts: ['What is this thing or place?', 'What do players already know?', 'What is hidden?'],
        fields: [{ key: 'category', label: 'Category', hint: 'Examples: Lore, Faction, Location, Myth', defaultValue: 'Lore' }],
        save: (draft) =>
          this.http
            .post<{ id?: string; compositeKey?: string }>(`/api/v2/campaigns/${cid()}/world-lore/lore${role}`, {
              title: draft.title,
              category: draft.fields['category'] || 'Lore',
              subtitle: '',
              excerpt: draft.bodyText.slice(0, 240),
              content: draft.bodyHtml,
              visibility: draft.visibility,
              tags: [],
              linkedEntityKeys: [...draft.linkedKeys],
            })
            .pipe(map((saved) => ({ kind: 'LoreEntry', key: saved.compositeKey ?? saved.id ?? draft.title }))),
      },
      {
        key: 'world-event',
        label: 'World event',
        summary: 'A dated event on the world timeline.',
        destination: 'Timeline: world history events.',
        defaultVisibility: 'players',
        templateHtml: '<h2>What happened</h2><p></p><h2>Consequences</h2><p></p>',
        prompts: ['When did it happen in world time?', 'Who or what was affected?', 'What changed afterwards?'],
        fields: [
          { key: 'eraName', label: 'Era', defaultValue: 'Current Age' },
          { key: 'worldDateLabel', label: 'World date', hint: 'Free text, e.g. "Year 412, Spring"' },
          { key: 'category', label: 'Category', defaultValue: 'Event' },
          { key: 'sessionNumber', label: 'Session number (optional)' },
        ],
        save: (draft) =>
          this.http
            .post<{ id?: string }>(`/api/v2/campaigns/${cid()}/world-lore/history${role}`, {
              title: draft.title,
              eraName: draft.fields['eraName'] || 'Current Age',
              worldDateLabel: draft.fields['worldDateLabel'] || '',
              category: draft.fields['category'] || 'Event',
              summary: draft.bodyText,
              sessionNumber: Number(draft.fields['sessionNumber']) || null,
              locationKey: null,
              visibility: draft.visibility === 'gm' ? 'gm' : 'players',
            })
            .pipe(map((saved) => ({ kind: 'WorldEvent', key: saved.id ?? draft.title }))),
      },
      {
        key: 'session-recap',
        label: 'Session recap',
        summary: 'What happened at the table, with highlights and XP.',
        destination: 'Sessions & Chronicles: session recap.',
        defaultVisibility: 'players',
        templateHtml: '<h2>Summary</h2><p></p><h2>Highlights</h2><ul><li></li></ul>',
        prompts: ['What was the session about?', 'What were the three best moments?', 'What is the hook for next time?'],
        fields: [
          { key: 'sessionNumber', label: 'Session number', hint: 'Leave 0 to auto-number', defaultValue: '0' },
          { key: 'location', label: 'Location' },
          { key: 'xp', label: 'XP awarded', defaultValue: '0' },
          { key: 'highlights', label: 'Highlights (one per line)' },
        ],
        save: (draft) =>
          this.http
            .post<{ sessionId?: string }>(`/api/v2/campaigns/${cid()}/sessions`, {
              sessionNumber: Number(draft.fields['sessionNumber']) || 0,
              title: draft.title,
              locationName: draft.fields['location'] || '',
              xpAwarded: Number(draft.fields['xp']) || 0,
              summary: draft.bodyText,
              highlights: (draft.fields['highlights'] || '').split('\n').map((line) => line.trim()).filter(Boolean),
            })
            .pipe(map((saved) => ({ kind: 'SessionRecap', key: saved.sessionId ?? draft.title }))),
      },
      {
        key: 'encounter',
        label: 'Encounter',
        summary: 'A combat, social, or exploration encounter for a scene.',
        destination: 'Encounters: encounter studio.',
        defaultVisibility: 'gm',
        templateHtml: '<h2>Setup</h2><p></p><h2>Read-aloud</h2><p></p><h2>Tactics</h2><p></p>',
        prompts: ['Where does this happen?', 'What do the enemies want?', 'What is the way out or the twist?'],
        fields: [
          { key: 'difficulty', label: 'Difficulty', hint: 'Moderate, Hard, Deadly, or Mythic', defaultValue: 'Moderate' },
          { key: 'encounterType', label: 'Type', hint: 'Combat, Social, Exploration, Mixed, or Boss', defaultValue: 'Combat' },
          { key: 'sessionId', label: 'Session id (optional)' },
        ],
        save: (draft) => {
          const id = `enc-${Date.now()}`;
          const name = draft.title.trim() || 'Untitled Encounter';
          const body = {
            id,
            compositeKey: `${cid()}:Encounter:${id}`,
            campaignId: cid(),
            sessionId: draft.fields['sessionId'] || '',
            sessionTitle: '',
            name,
            actLabel: 'Act I',
            encounterType: draft.fields['encounterType'] || 'Combat',
            status: 'Upcoming',
            completed: false,
            sceneKey: '',
            sceneName: 'Unassigned',
            environment: 'Dungeon',
            difficulty: draft.fields['difficulty'] || 'Moderate',
            partyLevel: 1,
            estimatedDuration: '',
            totalXp: 0,
            enemyCount: 0,
            thumbnailUrl: '',
            isCustom: true,
            summary: draft.bodyText.slice(0, 240) || name,
            description: draft.bodyText || name,
            readAloudText: '',
            objectives: [],
            monsters: [],
            partyMembers: [],
            sessionNpcs: [],
            traps: [],
            rewards: [],
            relatedLinks: [],
            sessionNotes: '',
          } as unknown as EncounterDetailVm;
          return this.http
            .post(`/api/v2/campaigns/${cid()}/encounters`, body)
            .pipe(map(() => ({ kind: 'Encounter', key: body.compositeKey })));
        },
      },
      {
        key: 'loom-note',
        label: 'Loom note',
        summary: 'A free-form note the Loom keeps and links to the graph.',
        destination: 'Sessions & Chronicles: Loom notes.',
        defaultVisibility: 'gm',
        templateHtml: '<p></p>',
        prompts: ['What do you want to remember?', 'Who or what does it concern?'],
        fields: [{ key: 'noteType', label: 'Note type', defaultValue: 'Note' }],
        save: (draft) =>
          this.http
            .post<{ compositeKey?: string; noteId?: string }>('/api/v2/loom/notes', {
              campaignId: cid(),
              title: draft.title,
              contentHtml: draft.bodyHtml,
              contentText: draft.bodyText,
              noteType: draft.fields['noteType'] || 'Note',
              visibility: draft.visibility === 'gm' ? 'gm' : 'global',
              authorUsername: this.store.activeUsername(),
              sourceEntityKey: null,
              sourceEntityName: null,
              mentionedCompositeKeys: [...draft.linkedKeys],
            })
            .pipe(map((saved) => ({ kind: 'LoomNote', key: saved.compositeKey ?? saved.noteId ?? draft.title }))),
      },
      {
        key: 'story-link',
        label: 'Story link',
        summary: 'Connect two entities in the connected story chain.',
        destination: 'Story: connected chain relationships.',
        defaultVisibility: 'players',
        templateHtml: '<p></p>',
        prompts: ['Why are these two connected?'],
        fields: [
          { key: 'fromKey', label: 'From (composite key)', hint: 'e.g. 900029:Npc:some-id' },
          { key: 'toKey', label: 'To (composite key)' },
          { key: 'relationshipType', label: 'Relationship', defaultValue: 'Connected' },
        ],
        save: (draft) =>
          this.http
            .post(`/api/v2/campaigns/${cid()}/story-chain/relationships${role}`, {
              fromCompositeKey: draft.fields['fromKey'] || '',
              relationshipType: draft.fields['relationshipType'] || 'Connected',
              toCompositeKey: draft.fields['toKey'] || '',
              whyIncludedLabel: draft.bodyText || draft.title,
              visibility: draft.visibility,
              markPreviousHistorical: false,
            })
            .pipe(map(() => ({ kind: 'StoryRelationship', key: `${draft.fields['fromKey']}->${draft.fields['toKey']}` }))),
      },
    ];
  }
}
