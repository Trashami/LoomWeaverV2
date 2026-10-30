import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LwIconComponent } from '../icon/icon.component';

@Component({
  selector: 'lw-page-header',
  standalone: true,
  imports: [LwIconComponent],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwPageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly icon = input<string>('book-open');
}
