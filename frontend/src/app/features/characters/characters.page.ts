import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwCharacterCreatorWizardComponent,
  LwCharacterSheetViewComponent,
  LwPageHeaderComponent,
} from '../../shared/ui/public-api';
import { CharacterConnectionChipVm } from './models/character-studio.models';
import { CharacterStudioService } from './services/character-studio.service';

@Component({
  selector: 'lw-characters-page',
  standalone: true,
  imports: [LwCharacterCreatorWizardComponent, LwCharacterSheetViewComponent, LwPageHeaderComponent],
  templateUrl: './characters.page.html',
  styleUrl: './characters.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharactersPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(LoomWeaverStoreService);
  readonly studio = inject(CharacterStudioService);

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const mode = params.get('mode');
      const focus = params.get('focus');
      this.studio.syncDefaultViewForSignedInUser(mode, focus);
    });
  }

  onConnectionClicked(chip: CharacterConnectionChipVm): void {
    this.store.inspectEntity(chip.compositeKey);
    void this.router.navigateByUrl(chip.routeLink);
  }
}
