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
import {
  CreateMenuTrigger,
  ReferenceCategory,
  ReferenceItem,
  buildReferenceChip,
  findMenuTrigger,
  referenceKindLabel,
} from './create-editor-menu';

const LAST_INTENT_KEY = 'lw.create.lastIntent';

export type CreateBlockKind = 'read-aloud' | 'dm-only' | 'trap' | 'encounter-note';
export type CreateCheckKind = 'passive-perception' | 'skill-check' | 'saving-throw';

const CREATE_BLOCKS: Record<CreateBlockKind, { heading: string }> = {
  'read-aloud': { heading: 'Read-aloud' },
  'dm-only': { heading: 'DM only' },
  trap: { heading: 'Trap' },
  'encounter-note': { heading: 'Encounter note' },
};

const CREATE_CHECKS: Record<CreateCheckKind, string> = {
  'passive-perception': 'Passive Perception',
  'skill-check': 'Skill check',
  'saving-throw': 'Saving throw',
};

interface MenuRow {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly item?: ReferenceItem;
}

interface EditorMenu {
  readonly trigger: CreateMenuTrigger;
  readonly step: 'categories' | 'items';
  readonly kind: string | null;
  readonly query: string;
}

const CREATE_ACTION_ROWS: readonly MenuRow[] = [
  { key: 'block:read-aloud', label: 'Read-aloud', detail: 'Boxed text to read to players' },
  { key: 'block:dm-only', label: 'DM only', detail: 'Hidden from players' },
  { key: 'block:trap', label: 'Trap', detail: 'Trap or hazard section' },
  { key: 'block:encounter-note', label: 'Encounter note', detail: 'Tactics and encounter notes' },
  { key: 'check:passive-perception', label: 'Passive Perception', detail: 'Insert a DC check' },
  { key: 'check:skill-check', label: 'Skill check', detail: 'Insert a DC check' },
  { key: 'check:saving-throw', label: 'Saving throw', detail: 'Insert a DC check' },
];

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

  readonly menu = signal<EditorMenu | null>(null);
  readonly menuIndex = signal(0);
  readonly menuPos = signal({ top: 0, left: 0 });
  readonly menuCategories = signal<readonly ReferenceCategory[]>([]);
  readonly menuItems = signal<readonly ReferenceItem[]>([]);
  readonly menuRows = computed<readonly MenuRow[]>(() => {
    const m = this.menu();
    if (!m) return [];
    const q = m.query.trim().toLowerCase();
    if (m.trigger === '/') return CREATE_ACTION_ROWS.filter((r) => !q || r.label.toLowerCase().includes(q));
    if (m.step === 'categories') {
      return this.menuCategories()
        .filter((c) => !q || referenceKindLabel(c.kind).toLowerCase().includes(q))
        .map((c) => ({ key: `kind:${c.kind}`, label: referenceKindLabel(c.kind), detail: `${c.count} in this campaign` }));
    }
    return this.menuItems().map((item) => ({ key: item.compositeKey, label: item.label, detail: item.subtitle || referenceKindLabel(item.kind), item }));
  });
  readonly menuTitle = computed(() => {
    const m = this.menu();
    if (!m) return '';
    if (m.trigger === '/') return 'Actions';
    return m.step === 'items' && m.kind ? referenceKindLabel(m.kind) : 'References';
  });

  private triggerRange: Range | null = null;
  private queryRange: Range | null = null;
  private itemRequest = 0;

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

  insertBlock(editor: HTMLElement, kind: CreateBlockKind): void {
    const block = CREATE_BLOCKS[kind];
    editor.focus();
    const html = `<section data-block="${kind}" class="lw-block lw-block--${kind}"><h3>${block.heading}</h3><p></p></section>`;
    document.execCommand('insertHTML', false, html);
  }

  insertCheck(editor: HTMLElement, check: CreateCheckKind): void {
    editor.focus();
    const label = CREATE_CHECKS[check];
    document.execCommand('insertHTML', false, `<span data-check="${check}" class="lw-check">[${label} DC ]</span>&nbsp;`);
  }

  onEditorInput(editor: HTMLElement): void {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const caret = sel.getRangeAt(0);
    const open = this.menu();
    if (!open) {
      if (caret.startContainer.nodeType !== Node.TEXT_NODE) return;
      const hit = findMenuTrigger((caret.startContainer as Text).data.slice(0, caret.startOffset));
      if (hit) this.startMenu(editor, hit.trigger, caret.startContainer, hit.index, hit.query);
      return;
    }
    const query = this.currentQuery();
    if (query === null || (open.step === 'categories' && /\s/.test(query))) {
      this.closeMenu();
      return;
    }
    this.menu.set({ ...open, query });
    this.menuIndex.set(0);
    if (open.trigger === '@' && open.step === 'items' && open.kind) this.loadItems(open.kind, query);
  }

  onEditorKeydown(event: KeyboardEvent, editor: HTMLElement): void {
    if (!this.menu()) return;
    const rows = this.menuRows();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.menuIndex.update((i) => (rows.length ? (i + 1) % rows.length : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.menuIndex.update((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
        break;
      case 'Enter':
      case 'Tab': {
        const row = rows[Math.min(this.menuIndex(), rows.length - 1)];
        if (!row) {
          this.closeMenu();
          return;
        }
        event.preventDefault();
        this.pickRow(row, editor);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.closeMenu();
        break;
    }
  }

  openMenuFromToolbar(editor: HTMLElement, trigger: CreateMenuTrigger): void {
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) {
      const end = document.createRange();
      end.selectNodeContents(editor);
      end.collapse(false);
      sel.removeAllRanges();
      sel.addRange(end);
    }
    document.execCommand('insertText', false, trigger);
    const caret = sel.getRangeAt(0);
    if (caret.startContainer.nodeType !== Node.TEXT_NODE || caret.startOffset < 1) return;
    this.startMenu(editor, trigger, caret.startContainer, caret.startOffset - 1, '');
  }

  pickRow(row: MenuRow, editor: HTMLElement): void {
    const m = this.menu();
    if (!m) return;
    if (row.key.startsWith('block:') || row.key.startsWith('check:')) {
      const range = this.consumeTrigger(editor);
      this.closeMenu();
      if (!range) return;
      if (row.key.startsWith('block:')) this.insertBlock(editor, row.key.slice(6) as CreateBlockKind);
      else this.insertCheck(editor, row.key.slice(6) as CreateCheckKind);
      return;
    }
    if (m.step === 'categories' && m.kind === null) {
      const kind = row.key.slice(5);
      this.consumeTrigger(editor);
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      this.queryRange = sel.getRangeAt(0).cloneRange();
      this.menu.set({ trigger: '@', step: 'items', kind, query: '' });
      this.menuIndex.set(0);
      this.loadItems(kind, '');
      return;
    }
    if (row.item) this.insertReference(editor, row.item);
  }

  private startMenu(editor: HTMLElement, trigger: CreateMenuTrigger, node: Node, index: number, query: string): void {
    this.triggerRange = document.createRange();
    this.triggerRange.setStart(node, index);
    this.triggerRange.collapse(true);
    this.queryRange = document.createRange();
    this.queryRange.setStart(node, index + 1);
    this.queryRange.collapse(true);
    this.menu.set({ trigger, step: 'categories', kind: null, query });
    this.menuIndex.set(0);
    this.placeMenu(editor);
    if (trigger === '@') this.loadCategories();
  }

  private placeMenu(editor: HTMLElement): void {
    const sel = window.getSelection();
    const rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const box = editor.getBoundingClientRect();
    const hasCaret = !!rect && (rect.width > 0 || rect.height > 0);
    this.menuPos.set({
      top: (hasCaret ? rect.bottom : box.top + 24) + 6,
      left: hasCaret ? rect.left : box.left + 12,
    });
  }

  private currentQuery(): string | null {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !this.queryRange) return null;
    const caret = sel.getRangeAt(0);
    const range = this.queryRange.cloneRange();
    try {
      range.setEnd(caret.endContainer, caret.endOffset);
    } catch {
      return null;
    }
    return range.toString();
  }

  // Removes the typed trigger text so the chosen section or reference replaces it.
  private consumeTrigger(editor: HTMLElement): Range | null {
    const m = this.menu();
    const sel = window.getSelection();
    const base = m?.trigger === '@' && m.step === 'items' ? this.queryRange : this.triggerRange;
    if (!m || !base || !sel?.rangeCount) return null;
    const caret = sel.getRangeAt(0);
    const range = base.cloneRange();
    try {
      range.setEnd(caret.endContainer, caret.endOffset);
    } catch {
      return null;
    }
    range.deleteContents();
    if (!editor.contains(range.startContainer)) return null;
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
  }

  private insertReference(editor: HTMLElement, item: ReferenceItem): void {
    const range = this.consumeTrigger(editor);
    this.closeMenu();
    if (!range) return;
    const chip = buildReferenceChip(item);
    const space = document.createTextNode('\u00a0');
    range.insertNode(space);
    range.insertNode(chip);
    const sel = window.getSelection();
    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(after);
  }

  private closeMenu(): void {
    this.menu.set(null);
    this.menuItems.set([]);
    this.triggerRange = null;
    this.queryRange = null;
  }

  private loadCategories(): void {
    const cid = this.store.activeCampaignId();
    this.http.get<{ categories: ReferenceCategory[] }>(`/api/v2/campaigns/${cid}/references`).subscribe({
      next: (res) => this.menuCategories.set(res.categories),
      error: () => this.menuCategories.set([]),
    });
  }

  private loadItems(kind: string, query: string): void {
    const cid = this.store.activeCampaignId();
    const request = ++this.itemRequest;
    const params = `kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(query)}`;
    this.http.get<{ items: ReferenceItem[] }>(`/api/v2/campaigns/${cid}/references?${params}`).subscribe({
      next: (res) => {
        if (request === this.itemRequest) this.menuItems.set(res.items);
      },
      error: () => {
        if (request === this.itemRequest) this.menuItems.set([]);
      },
    });
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
      linkedKeys: [
        ...[...editor.querySelectorAll<HTMLElement>('[data-ref-key]')].map((el) => el.dataset['refKey'] ?? ''),
        ...this.linkedKeysText().split(/[\n,]/).map((k) => k.trim()),
      ].filter((k, i, all) => !!k && all.indexOf(k) === i),
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
