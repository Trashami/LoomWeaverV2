import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';

@Component({
  selector: 'lw-rules-reference',
  standalone: true,
  imports: [LwIconComponent],
  templateUrl: './rules-reference.component.html',
  styleUrl: './rules-reference.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RulesReferenceComponent {}
