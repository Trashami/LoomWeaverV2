import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { AtlasBrush, AtlasDocument, AtlasLocation, AtlasMarker, AtlasMarkerKind, AtlasTool, cloneAtlas, DEFAULT_ATLAS_BRUSH, validateAtlas } from '../engine/atlas/atlas-document';
import { applyAtlasBrush, createAtlas, strokePoints } from '../engine/atlas/atlas-terrain';
import { atlasPreview, downloadAtlasFile } from '../engine/atlas/atlas-export';

export interface AtlasSummary {id:string;name:string;revision:number;}
@Injectable()
export class AtlasEditorStore {
  private readonly http=inject(HttpClient);
  readonly campaign=inject(LoomWeaverStoreService);
  readonly auth=inject(AuthSessionService);
  readonly document=signal<AtlasDocument>(createAtlas());
  readonly tool=signal<AtlasTool>('navigate');
  readonly brush=signal<AtlasBrush>(DEFAULT_ATLAS_BRUSH);
  readonly selectedId=signal<string|null>(null);
  readonly selected=computed(()=>this.document().markers.find(m=>m.id===this.selectedId())??null);
  readonly locations=signal<AtlasLocation[]>([]);
  readonly atlases=signal<AtlasSummary[]>([]);
  readonly status=signal('');
  readonly busy=signal(false);
  readonly dirty=signal(false);
  readonly canUndo=signal(false);
  readonly canRedo=signal(false);
  readonly locationName=signal('New Village');
  readonly locationKind=signal<AtlasMarkerKind>('village');
  readonly linkedKey=signal('');
  readonly markerColor=signal('#d9b77a');
  readonly markerVisibility=signal<'gm'|'players'>('gm');
  private past:AtlasDocument[]=[];
  private future:AtlasDocument[]=[];
  private last:{x:number;z:number}|null=null;
  private session=0;
  private readonly drafts=new Map<string,{doc:AtlasDocument;dirty:boolean}>();
  private activeDraftKey='';
  constructor(){
    effect(()=>{
      const key=`${this.auth.activeAccountId()}:${this.campaign.activeCampaignId()}`;
      if(key===this.activeDraftKey)return;
      if(this.activeDraftKey)this.drafts.set(this.activeDraftKey,{doc:cloneAtlas(this.document()),dirty:this.dirty()});
      this.activeDraftKey=key;this.session++;
      const draft=this.drafts.get(key);this.document.set(draft?.doc??createAtlas());this.dirty.set(draft?.dirty??false);
      this.resetHistory();this.selectedId.set(null);this.atlases.set([]);this.locations.set([]);
      void this.refresh();
    });
  }
  private base():string{return `/api/v2/campaigns/${this.campaign.activeCampaignId()}/atlases`;}
  async refresh():Promise<void>{
    const session=this.session;
    try{
      const [atlases,locations]=await Promise.all([firstValueFrom(this.http.get<AtlasSummary[]>(this.base())),firstValueFrom(this.http.get<AtlasLocation[]>(this.base()+'/locations'))]);
      if(session!==this.session)return;this.atlases.set(atlases);this.locations.set(locations);
      this.status.set('');
    }catch(e){if(session===this.session)this.status.set(this.error(e));}
  }
  private error(e:unknown):string{
    if(e instanceof HttpErrorResponse){
      if(e.status===401)return 'Sign in to save campaign atlases. You can still experiment and export a JSON backup.';
      if(e.status===403)return 'Campaign GM access is required for this atlas editor.';
      if(e.status===409)return 'A newer server revision exists. Export your edits before reopening the saved atlas.';
      return e.error?.message??'Campaign service unavailable. Your edits remain here; export a JSON backup.';
    }return e instanceof Error?e.message:'The operation could not be completed.';
  }
  private remember():void {this.past.push(cloneAtlas(this.document()));if(this.past.length>20)this.past.shift();this.future=[];this.updateHistory();}
  private updateHistory():void{this.canUndo.set(this.past.length>0);this.canRedo.set(this.future.length>0);}
  private resetHistory():void{this.past=[];this.future=[];this.updateHistory();}
  undo():void{const d=this.past.pop();if(d){this.future.push(cloneAtlas(this.document()));this.document.set({...d,revision:this.document().revision});this.dirty.set(true);this.updateHistory();}}
  redo():void{const d=this.future.pop();if(d){this.past.push(cloneAtlas(this.document()));this.document.set({...d,revision:this.document().revision});this.dirty.set(true);this.updateHistory();}}
  change(patch:Partial<Pick<AtlasDocument,'name'|'widthKm'|'heightKm'|'seaLevel'>>):void{
    const candidate={...this.document(),...patch};
    try{validateAtlas(candidate);}catch(e){this.status.set(this.error(e));return;}
    this.remember();this.document.update(d=>({...d,...patch}));this.dirty.set(true);
  }
  regenerate(seed:number):void{if(!Number.isFinite(seed))return;this.remember();const d=this.document();this.document.set({...createAtlas(Math.trunc(seed)|0),id:d.id,revision:d.revision,name:d.name,widthKm:d.widthKm,heightKm:d.heightKm});this.selectedId.set(null);this.dirty.set(true);}
  newAtlas():void{
    this.drafts.set(this.activeDraftKey,{doc:cloneAtlas(this.document()),dirty:this.dirty()});
    if(this.dirty()){this.exportJson();this.status.set('Previous unsaved atlas exported as a backup.');}
    this.document.set(createAtlas(Math.floor(Math.random()*100000)));this.resetHistory();this.dirty.set(false);this.selectedId.set(null);
  }
  start(x:number,z:number):void{
    if(this.tool()==='location'){this.place(x,z);return;}
    if(this.tool()==='navigate')return;
    this.remember();this.last={x,z};applyAtlasBrush(this.document(),this.tool(),x,z,this.brush());this.document.update(d=>({...d}));this.dirty.set(true);
  }
  move(x:number,z:number):void{
    if(!this.last)return;
    for(const p of strokePoints(this.last,{x,z},this.brush().radius))applyAtlasBrush(this.document(),this.tool(),p.x,p.z,this.brush());
    this.last={x,z};this.document.update(d=>({...d}));
  }
  finish():void{this.last=null;}
  place(x:number,z:number):void{
    const linked=this.locations().find(l=>l.locationKey===this.linkedKey());
    if(linked&&this.document().markers.some(m=>m.locationKey===linked.locationKey)){
      const m=this.document().markers.find(m=>m.locationKey===linked.locationKey)!;this.selectedId.set(m.id);this.updateMarker({x,z});return;
    }
    this.remember();const id=crypto.randomUUID();
    const marker:AtlasMarker={id,locationKey:linked?.locationKey??`loc-${id}`,name:linked?.name??(this.locationName().trim()||'New Location'),
      kind:this.locationKind(),x,z,color:this.markerColor(),visibility:linked?.visibility??this.markerVisibility()};
    this.document.update(d=>({...d,markers:[...d.markers,marker]}));this.selectedId.set(id);this.dirty.set(true);
  }
  updateMarker(patch:Partial<AtlasMarker>):void{
    if(!this.selected())return;this.remember();this.document.update(d=>({...d,markers:d.markers.map(m=>m.id===this.selectedId()?{...m,...patch}:m)}));this.dirty.set(true);
  }
  removeMarker():void{this.remember();this.document.update(d=>({...d,markers:d.markers.filter(m=>m.id!==this.selectedId())}));this.selectedId.set(null);this.dirty.set(true);}
  async save():Promise<void>{
    this.finish();const session=this.session,snapshot=cloneAtlas(this.document());
    this.busy.set(true);
    try{
      validateAtlas(snapshot);
      snapshot.previewDataUrl=atlasPreview(snapshot,512,false).toDataURL('image/png');
      const result=await firstValueFrom(this.http.put<AtlasDocument>(this.base()+'/'+snapshot.id,snapshot));
      if(session!==this.session)return;
      // Editing is disabled while saving, so the accepted revision matches the visible document.
      this.document.set(validateAtlas(result));this.dirty.set(false);await this.refresh();this.status.set(`Saved ${result.name}, revision ${result.revision}. Locations linked to campaign lore.`);
    }catch(e){if(session===this.session)this.status.set(this.error(e));}finally{this.busy.set(false);}
  }
  async open(id:string):Promise<void>{
    if(!id)return;if(this.dirty())this.exportJson();
    const session=this.session;this.busy.set(true);
    try{const d=validateAtlas(await firstValueFrom(this.http.get<AtlasDocument>(this.base()+'/'+id)));if(session!==this.session)return;
      this.document.set(d);this.dirty.set(false);this.resetHistory();this.selectedId.set(null);this.status.set(`Opened ${d.name}, revision ${d.revision}.`);
    }catch(e){this.status.set(this.error(e));}finally{this.busy.set(false);}
  }
  exportJson():void{downloadAtlasFile(new Blob([JSON.stringify(this.document())],{type:'application/json'}),`${this.document().name}.atlas.json`);}
  async importJson(file:File):Promise<void>{
    try{const d=validateAtlas(JSON.parse(await file.text()));if(this.dirty())this.exportJson();
      this.document.set({...cloneAtlas(d),id:crypto.randomUUID(),revision:0});this.resetHistory();this.dirty.set(true);this.selectedId.set(null);this.status.set('Imported as a new atlas. Save to add it to this campaign.');
    }catch(e){this.status.set(this.error(e));}
  }
  exportPng():void{atlasPreview(this.document(),1536,true).toBlob(b=>{if(b)downloadAtlasFile(b,`${this.document().name}-player-map.png`);});}
}
