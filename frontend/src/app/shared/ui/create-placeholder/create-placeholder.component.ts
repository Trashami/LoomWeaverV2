import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LwIconComponent } from '../icon/icon.component';

/** Greyed dashboard container shown when a section has no data yet. The centered "+" links to the page that creates it. */
@Component({
  selector: 'lw-create-placeholder',
  standalone: true,
  imports: [RouterLink, LwIconComponent],
  templateUrl: './create-placeholder.component.html',
  styleUrl: './create-placeholder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwCreatePlaceholderComponent {
  readonly title = input.required<string>();
  readonly hint = input.required<string>();
  readonly route = input.required<string>();
}
