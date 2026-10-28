import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwButtonComponent } from '../button/button.component';
import { AtlasBrush, AtlasDocument, AtlasLocation, AtlasMarker, AtlasMarkerKind, AtlasTool, ATLAS_BIOMES } from '../../../features/maps/engine/atlas/atlas-document';
export interface AtlasLocationDraft {name:string;kind:AtlasMarkerKind;linkedKey:string;color:string;visibility:'gm'|'players';}
@Component({selector:'lw-atlas-controls',standalone:true,imports:[FormsModule,NgpButton,LwButtonComponent],
  templateUrl:'./atlas-controls.component.html',styleUrl:'./atlas-controls.component.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class LwAtlasControlsComponent {
  readonly document=input.required<AtlasDocument>();readonly brush=input.required<AtlasBrush>();readonly tool=input<AtlasTool>('navigate');
  readonly selected=input<AtlasMarker|null>(null);readonly locations=input<AtlasLocation[]>([]);
  readonly locationDraft=input.required<AtlasLocationDraft>();readonly disabled=input(false);
  readonly toolChanged=output<AtlasTool>();readonly brushChanged=output<AtlasBrush>();
  readonly worldChanged=output<Partial<Pick<AtlasDocument,'name'|'widthKm'|'heightKm'|'seaLevel'>>>();
  readonly markerChanged=output<Partial<AtlasMarker>>();readonly draftChanged=output<Partial<AtlasLocationDraft>>();
  readonly markerRemoved=output<void>();readonly markerSelected=output<string>();readonly regenerate=output<number>();
  readonly section=signal('Terrain');readonly sections=['Terrain','Biomes','Locations','World'];readonly biomes=ATLAS_BIOMES;
  readonly terrainTools:readonly {id:AtlasTool;label:string}[]=[{id:'raise',label:'Raise land'},{id:'lower',label:'Lower / carve'},
    {id:'mountains',label:'Mountain range'},{id:'smooth',label:'Smooth'},{id:'flatten',label:'Flatten'}];
  readonly kinds:AtlasMarkerKind[]=['city','town','village','castle','ruin','landmark'];
  setBrush(key:keyof AtlasBrush,value:number):void{this.brushChanged.emit({...this.brush(),[key]:value});}
  pickSection(section:string):void{this.section.set(section);if(section==='Biomes')this.toolChanged.emit('biome');if(section==='Locations')this.toolChanged.emit('navigate');}
}
