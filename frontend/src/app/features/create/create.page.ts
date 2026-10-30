import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ContentDraft, ContentIntent, ContentIntentService, ContentVisibility } from '../../core/services/content-intent.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwPageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { LwPanelComponent } from '../../shared/ui/panel/panel.component';

const LAST_INTENT_KEY = 'lw.create.lastIntent';

interface FiledEntry {
  readonly title: string;
  readonly label: string;
  readonly compositeKey: string | null;
  readonly graphProjected: boolean;
}

interface CaptureRow {
  readonly captureKey: string;
  readonly intent: string;
  readonly title: string;
  readonly targetKind: string;
  readonly createdAt: string;
}

@Component({
  selector: 'lw-create-page',
  standalone: true,
  imports: [DatePipe, FormsModule, LwPageHeaderComponent, LwPanelComponent],
  templateUrl: './create.page.html',
  styleUrl: './create.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly registry = inject(ContentIntentService);

  readonly intents = this.registry.intents;
  private readonly intentKey = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('intent'))), {
    initialValue: this.route.snapshot.queryParamMap.get('intent'),
  });

  readonly intent = computed<ContentIntent | null>(() => this.registry.find(this.intentKey()));
  readonly lastIntent = signal<ContentIntent | null>(this.readLastIntent());

  readonly title = signal('');
  readonly visibility = signal<ContentVisibility>('gm');
  readonly linkedKeysText = signal('');
  readonly fieldValues = signal<Record<string, string>>({});
  readonly saving = signal(false);
  readonly status = signal<{ tone: 'ok' | 'error'; text: string } | null>(null);
  readonly filed = signal<FiledEntry | null>(null);
  readonly recent = signal<readonly CaptureRow[]>([]);

  constructor() {
    this.route.queryParamMap.subscribe(() => this.resetForm());
    this.loadRecent();
  }

  choose(intent: ContentIntent): void {
    void this.router.navigate(['/create'], { queryParams: { intent: intent.key } });
  }

  resume(): void {
    const last = this.lastIntent();
    if (last) this.choose(last);
  }

  discard(): void {
    void this.router.navigate(['/create']);
  }

  setField(key: string, value: string): void {
    this.fieldValues.update((current) => ({ ...current, [key]: value }));
  }

  fieldValue(key: string): string {
    return this.fieldValues()[key] ?? '';
  }

  format(command: string, value?: string): void {
    document.execCommand(command, false, value);
  }

  useTemplate(editor: HTMLElement): void {
    const intent = this.intent();
    if (intent) editor.innerHTML = intent.templateHtml;
  }

  save(editor: HTMLElement): void {
    const intent = this.intent();
    if (!intent || this.saving()) return;
    const title = this.title().trim();
    if (!title) {
      this.status.set({ tone: 'error', text: 'Give this entry a title before saving.' });
      return;
    }
    const draft: ContentDraft = {
      title,
      bodyHtml: editor.innerHTML,
      bodyText: editor.innerText.trim(),
      visibility: this.visibility(),
      linkedKeys: this.linkedKeysText().split(/[\n,]/).map((k) => k.trim()).filter(Boolean),
      fields: this.fieldValues(),
    };
    this.saving.set(true);
    this.status.set(null);
    this.registry.saveAndCapture(intent, draft).subscribe({
      next: (receipt) => {
        this.saving.set(false);
        // The written content stays on screen until the user chooses to write another entry.
        this.filed.set({
          title,
          label: intent.destination,
          compositeKey: receipt.compositeKey,
          graphProjected: receipt.graphProjected,
        });
        this.loadRecent();
      },
      error: () => {
        this.saving.set(false);
        this.status.set({ tone: 'error', text: `${intent.label} was not saved. Nothing was recorded. Try again.` });
      },
    });
  }

  writeAnother(editor: HTMLElement): void {
    editor.innerHTML = '';
    this.title.set('');
    this.linkedKeysText.set('');
    this.filed.set(null);
    this.status.set(null);
  }

  private resetForm(): void {
    const intent = this.intent();
    if (intent) {
      localStorage.setItem(LAST_INTENT_KEY, intent.key);
      this.visibility.set(intent.defaultVisibility);
      this.fieldValues.set(Object.fromEntries(intent.fields.map((f) => [f.key, f.defaultValue ?? ''])));
    }
    this.title.set('');
    this.filed.set(null);
    this.status.set(null);
    this.lastIntent.set(this.readLastIntent());
  }

  private readLastIntent(): ContentIntent | null {
    return this.registry.find(localStorage.getItem(LAST_INTENT_KEY));
  }

  private loadRecent(): void {
    const cid = this.store.activeCampaignId();
    this.http.get<readonly CaptureRow[]>(`/api/v2/campaigns/${cid}/content-captures?limit=8`).subscribe({
      next: (rows) => this.recent.set(rows),
      error: () => this.recent.set([]),
    });
  }
}
