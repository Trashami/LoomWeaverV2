import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwBadgeComponent,
  LwButtonComponent,
  LwIconComponent,
  LwPanelComponent,
  LwScopedNoteCardComponent,
  LwScopedNoteItem,
  LwPageHeaderComponent,
} from '../../shared/ui/public-api';

interface GraphRagPathItem {
  readonly pathSummary: string;
  readonly sourceKey: string;
  readonly relationshipType: string;
  readonly targetKey: string;
  readonly visibility: string;
}

@Component({
  selector: 'lw-loom-page',
  standalone: true,
  imports: [
    LwPageHeaderComponent,
    FormsModule,
    RouterLink,
    LwPanelComponent,
    LwBadgeComponent,
    LwButtonComponent,
    LwIconComponent,
    LwScopedNoteCardComponent,
  ],
  templateUrl: './loom.page.html',
  styleUrl: './loom.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoomPageComponent {
  private readonly http = inject(HttpClient);
  readonly store = inject(LoomWeaverStoreService);
  readonly generativeAiEnabled = input<boolean>(false);
  readonly isWeaveEnabled = computed(
    () => this.generativeAiEnabled() || this.store.weaveEnabled(),
  );

  readonly witnessOptions = ['All Party'];
  readonly activeWitness = signal<string>('All Party');
  readonly notes = signal<readonly LwScopedNoteItem[]>([]);
  readonly synthesisBanner = signal<string>(
    'Select a campaign to search its authorized lore.',
  );

  readonly graphPaths = signal<readonly GraphRagPathItem[]>([]);

  readonly newNoteTitle = signal<string>('');
  readonly newNoteContent = signal<string>('');
  readonly newNoteScope = signal<'party_shared' | 'private_player' | 'gm_only'>('party_shared');
  readonly newNoteWitness = signal<string>('Party');
  readonly newNoteRoute = signal<string>('/campaigns');

  readonly presetPrompts: readonly string[] = [];

  readonly visibleNotes = computed(() => {
    const isGm = this.store.viewerRole() === 'gm';
    const witness = this.activeWitness();
    return this.notes().filter((n) => {
      if (n.scope === 'gm_only' && !isGm) return false;
      if (
        n.scope === 'private_player' &&
        !isGm &&
        witness !== 'All Party' &&
        n.witnessCharacter !== witness
      ) {
        return false;
      }
      if (witness !== 'All Party' && n.witnessCharacter !== witness && n.scope === 'private_player') {
        return false;
      }
      return true;
    });
  });

  readonly visibleGraphPaths = computed(() => {
    const isGm = this.store.viewerRole() === 'gm';
    return this.graphPaths().filter((p) => isGm || p.visibility !== 'gm');
  });

  constructor() {
    effect((onCleanup) => {
      const campaignId = this.store.activeCampaignId();
      this.notes.set([]);
      this.graphPaths.set([]);
      if (campaignId <= 0) {
        this.synthesisBanner.set('Select a campaign to search its authorized lore.');
        return;
      }

      const subscription = this.fetchNotes(campaignId);
      onCleanup(() => subscription.unsubscribe());
    });
  }

  selectWitness(witness: string): void {
    this.activeWitness.set(witness);
    this.executeGraphRagSearch(this.store.loomQuery());
  }

  executeGraphRagSearch(promptText: string): void {
    const campaignId = this.store.activeCampaignId();
    if (campaignId <= 0) {
      this.synthesisBanner.set('Select a campaign before searching lore.');
      return;
    }

    this.store.loomQuery.set(promptText);
    this.http
      .post<{
        synthesis: string;
        graphPaths: readonly GraphRagPathItem[];
      }>(`/api/v2/campaigns/${campaignId}/loom/query`, {
        query: promptText,
        role: this.store.viewerRole(),
        witnessCharacter: this.activeWitness(),
        includePrivateNotes: true,
      })
      .subscribe({
        next: (res) => {
          this.synthesisBanner.set(res?.synthesis ?? 'No lore synthesis was returned.');
          this.graphPaths.set(res?.graphPaths ?? []);
        },
        error: () => this.synthesisBanner.set('Lore search failed. No results were substituted.'),
      });
  }

  saveScopedNote(): void {
    const title = this.newNoteTitle().trim();
    const content = this.newNoteContent().trim();
    if (!title || !content) return;
    const campaignId = this.store.activeCampaignId();
    if (campaignId <= 0) {
      this.synthesisBanner.set('Select a campaign before saving a note.');
      return;
    }

    const payload = {
      title,
      content,
      scope: this.newNoteScope(),
      authorName: this.newNoteWitness(),
      witnessCharacter: this.newNoteWitness(),
      sessionNumber: 0,
      deepLinkRoute: this.newNoteRoute(),
      linkedEntityKeys: [],
    };

    this.http.post<LwScopedNoteItem>(`/api/v2/campaigns/${campaignId}/notes`, payload).subscribe({
      next: (created) => {
        this.notes.update((prev) => [created, ...prev]);
        this.newNoteTitle.set('');
        this.newNoteContent.set('');
        this.synthesisBanner.set('Note saved.');
      },
      error: () => this.synthesisBanner.set('Note could not be saved. No local copy was created.'),
    });
  }

  private fetchNotes(campaignId: number) {
    return this.http
      .get<readonly LwScopedNoteItem[]>(`/api/v2/campaigns/${campaignId}/notes`)
      .subscribe({
        next: (notes) => this.notes.set(notes ?? []),
        error: () => this.synthesisBanner.set('Campaign notes could not be loaded.'),
      });
  }
}
