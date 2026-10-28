import { LwMapToolDockComponent, MapDockToolItem } from '../../../shared/ui/map-tool-dock/map-tool-dock.component';
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { LwButtonComponent } from '../../../shared/ui/button/button.component';
import { AtlasLocationDraft, LwAtlasControlsComponent } from '../../../shared/ui/atlas-controls/atlas-controls.component';
import { AtlasEditorStore } from './atlas-editor.store';
import { AtlasStage, AtlasPointer } from '../engine/atlas/atlas-stage';

@Component({selector:'lw-atlas-page',standalone:true,imports:[LwButtonComponent,LwAtlasControlsComponent,LwMapToolDockComponent],providers:[AtlasEditorStore],
  templateUrl:'./atlas.page.html',styleUrl:'./atlas.page.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class AtlasPageComponent implements AfterViewInit,OnDestroy {
  readonly editor=inject(AtlasEditorStore);
  readonly activeDock=signal('navigate');readonly section=signal('Terrain');readonly clouds=signal(true);readonly dockCollapsed=signal(false);
  readonly tools:readonly MapDockToolItem[]=[
    {id:'navigate',label:'Select',icon:'cursor',layerHint:'Navigate and select locations'},
    {id:'Terrain',label:'Terrain',icon:'map',layerHint:'Raise, lower and shape mountain ranges'},
    {id:'Biomes',label:'Biomes',icon:'pipette',layerHint:'Paint biome regions'},
    {id:'Locations',label:'Locations',icon:'landmark',layerHint:'Campaign cities and villages'},
    {id:'World',label:'World',icon:'globe',layerHint:'World scale and sea level'},
  ];
  chooseTool(id:string):void {this.activeDock.set(id);if(id==='navigate'){this.editor.tool.set('navigate');return;}this.section.set(id);this.properties.set(true);this.editor.tool.set(id==='Biomes'?'biome':id==='Terrain'?'raise':'navigate');}
  readonly top=signal(false);readonly grid=signal(false);readonly labels=signal(true);readonly properties=signal(true);
  readonly draft=computed<AtlasLocationDraft>(()=>({name:this.editor.locationName(),kind:this.editor.locationKind(),linkedKey:this.editor.linkedKey(),color:this.editor.markerColor(),visibility:this.editor.markerVisibility()}));
  readonly renderError=signal('');
  @ViewChild('canvas')canvas!:ElementRef<HTMLCanvasElement>;
  private stage:AtlasStage|null=null;
  private frame=0;
  private readonly unload=(e:BeforeUnloadEvent)=>{if(this.editor.dirty()){e.preventDefault();e.returnValue='';}};
  constructor(){
    effect(()=>{this.editor.document();cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.stage?.update(this.editor.document()));});
    effect(()=>{const tool=this.editor.tool(),busy=this.editor.busy();this.stage?.setEditing(tool!=='navigate'&&!busy);});
    effect(()=>{const id=this.editor.selectedId(),labels=this.labels();this.stage?.select(id,labels);});
    effect(()=>{const radius=this.editor.brush().radius;this.stage?.setBrushRadius(radius);});
    effect(()=>{const clouds=this.clouds();this.stage?.setClouds(clouds);});
    effect(()=>{const top=this.top();this.stage?.setView(top);});effect(()=>{const grid=this.grid();this.stage?.setGrid(grid);});
  }
  ngAfterViewInit():void{
    try{this.stage=new AtlasStage(this.canvas.nativeElement,p=>this.pointer(p));this.stage.update(this.editor.document());this.stage.setEditing(this.editor.tool()!=='navigate');}
    catch(e){this.renderError.set('3D rendering could not start. Try a browser with WebGL enabled; JSON import/export remains available.');console.error('Atlas renderer startup failed',e);}
    window.addEventListener('beforeunload',this.unload);
  }
  private pointer(p:AtlasPointer):void{
    if(this.editor.busy())return;
    if(p.markerId){this.section.set('Locations');this.editor.selectedId.set(p.markerId);this.properties.set(true);return;}
    if(p.phase==='start')this.editor.start(p.x,p.z);if(p.phase==='move')this.editor.move(p.x,p.z);if(p.phase==='end')this.editor.finish();
  }
  setDraft(p:Partial<AtlasLocationDraft>):void{
    if(p.name!==undefined)this.editor.locationName.set(p.name);if(p.kind)this.editor.locationKind.set(p.kind);
    if(p.linkedKey!==undefined)this.editor.linkedKey.set(p.linkedKey);if(p.color)this.editor.markerColor.set(p.color);if(p.visibility)this.editor.markerVisibility.set(p.visibility);
  }
  focus(id:string):void{this.editor.selectedId.set(id);const m=this.editor.selected();if(m)this.stage?.focus(m.x,m.z);}
  frameAll():void{this.stage?.frameAll();}
  importFile(event:Event):void{const input=event.target as HTMLInputElement;if(input.files?.[0])void this.editor.importJson(input.files[0]);input.value='';}
  ngOnDestroy():void{cancelAnimationFrame(this.frame);window.removeEventListener('beforeunload',this.unload);this.stage?.dispose();}
}
