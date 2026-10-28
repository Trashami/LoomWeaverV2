import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { AtlasPageComponent } from '../../../frontend/src/app/features/maps/atlas/atlas.page';
import { AuthSessionService } from '../../../frontend/src/app/core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../frontend/src/app/core/services/loomweaver-store.service';
import { MapsPageComponent } from '../../../frontend/src/app/features/maps/maps.page';
import { LwAppHeaderBarComponent } from '../../../frontend/src/app/shared/ui/app-header-bar/app-header-bar.component';
import { LwLoomLauncherComponent } from '../../../frontend/src/app/shared/ui/loom-launcher/loom-launcher.component';

@Component({
  selector: 'lw-maps-studio-root',
  standalone: true,
  imports: [
    LwAppHeaderBarComponent,
    LwLoomLauncherComponent,
    MapsPageComponent,
    AtlasPageComponent, NgpButton,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoomMapsStudioAppComponent {
  readonly mode = signal<'battlemap'|'atlas'>(new URLSearchParams(location.search).get('mode')==='atlas'?'atlas':'battlemap');
  readonly atlasOpened = signal(this.mode()==='atlas');
  setMode(mode:'battlemap'|'atlas'):void {
    this.mode.set(mode);if(mode==='atlas')this.atlasOpened.set(true);
    const url=new URL(location.href);url.searchParams.set('mode',mode);history.replaceState(null,'',url);
  }
  readonly store = inject(LoomWeaverStoreService);
  readonly auth = inject(AuthSessionService);
  readonly loomDrawerOpen = signal<boolean>(false);

  onCampaignSelected(campaignId: number): void {
    this.store.setCampaign(campaignId);
  }

  onToggleViewerRole(): void {
    this.store.setViewerRole(this.store.viewerRole() === 'gm' ? 'players' : 'gm');
  }
}
