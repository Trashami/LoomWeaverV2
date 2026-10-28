import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'lw-panel',
  standalone: true,
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwPanelComponent {
  readonly variant = input<'default' | 'studio' | 'page-header'>('default');
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly eyebrow = input<string>('');
  readonly icon = input<string | null>(null);
  readonly elevated = input<boolean>(false);
  readonly padded = input<boolean>(true);
}
