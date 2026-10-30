import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LwButtonComponent } from '../button/button.component';

/** Numbered pager for server-paged lists. Pages are zero-based; the visible label is one-based. */
@Component({
  selector: 'lw-pager',
  standalone: true,
  imports: [LwButtonComponent],
  templateUrl: './pager.component.html',
  styleUrl: './pager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwPagerComponent {
  readonly page = input.required<number>();
  readonly pageCount = input.required<number>();
  readonly total = input<number>(0);
  readonly busy = input<boolean>(false);
  readonly pageChange = output<number>();

  /** Page indexes to render, with `-1` standing in for an ellipsis. */
  readonly slots = computed<readonly number[]>(() => {
    const count = Math.max(1, this.pageCount());
    const current = this.page();
    if (count <= 7) return Array.from({ length: count }, (_, i) => i);
    const near = new Set<number>([0, count - 1, current - 1, current, current + 1]);
    const pages = [...near].filter((p) => p >= 0 && p < count).sort((a, b) => a - b);
    const out: number[] = [];
    pages.forEach((p, i) => {
      if (i > 0 && p - pages[i - 1] > 1) out.push(-1);
      out.push(p);
    });
    return out;
  });

  go(index: number): void {
    if (this.busy() || index === this.page() || index < 0 || index >= this.pageCount()) return;
    this.pageChange.emit(index);
  }
}
