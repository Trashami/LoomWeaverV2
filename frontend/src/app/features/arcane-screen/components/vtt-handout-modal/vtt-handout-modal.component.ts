import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { VttHandoutService } from '../../services/vtt-handout.service';

@Component({
  selector: 'lw-vtt-handout-modal',
  standalone: true,
  imports: [FormsModule, NgpButton, LwIconComponent],
  templateUrl: './vtt-handout-modal.component.html',
  styleUrl: './vtt-handout-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttHandoutModalComponent {
  readonly handouts = inject(VttHandoutService);
  readonly store = inject(LoomWeaverStoreService);

  readonly showCompose = computed(() => this.handouts.composeOpen() && this.store.viewerRole() === 'gm');
  readonly showView = computed(() => this.handouts.viewOpen() && this.handouts.revealed() !== null);
}
