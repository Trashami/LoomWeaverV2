import { ArcRotateCamera, Color3, Color4, Constants, Engine, LinesMesh, Mesh, MeshBuilder, PointerEventTypes, RawTexture, Scene, ShaderMaterial, Vector3, VertexData } from '@babylonjs/core';
import { AtlasDocument, ATLAS_BIOMES, ATLAS_RELIEF, ATLAS_SIZE, atlasRelief } from './atlas-document';
import { atlasCloudMaterial, atlasOceanMaterial, atlasTerrainMaterial } from './atlas-materials';
import { AtlasMarkers } from './atlas-markers';
import { sampleAtlas } from './atlas-terrain';

export interface AtlasPointer { phase:'start'|'move'|'end';x:number;z:number;markerId?:string; }
export class AtlasStage {
  private readonly engine:Engine;
  private readonly scene:Scene;
  private readonly camera:ArcRotateCamera;
  private readonly terrainMat:ShaderMaterial;
  private readonly waterMat:ShaderMaterial;
  private readonly ocean:Mesh;
  private readonly clouds:Mesh;
  private readonly cloudMat:ShaderMaterial;
  private readonly inputAbort=new AbortController();
  private readonly markers:AtlasMarkers;
  private chunks:Mesh[]=[];
  private texture:RawTexture|null=null;
  private document:AtlasDocument|null=null;
  private dragging=false;
  private editing=false;
  private selected:string|null=null;
  private showLabels=true;
  private brushRadius=9;
  private brushRing:LinesMesh|null=null;
  private readonly resize:ResizeObserver;
  private readonly release=()=>{if(this.dragging){this.dragging=false;this.onPointer({phase:'end',x:0,z:0});}};
  constructor(private readonly canvas:HTMLCanvasElement,private readonly onPointer:(p:AtlasPointer)=>void) {
    this.engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true});
    this.scene=new Scene(this.engine);this.scene.clearColor=new Color4(.025,.065,.072,1);
    this.camera=new ArcRotateCamera('atlas-camera',-Math.PI/2,Math.PI*.28,290,Vector3.Zero(),this.scene);
    this.camera.attachControl(true,true,1);this.camera.lowerRadiusLimit=18;this.camera.upperRadiusLimit=430;
    this.camera.lowerBetaLimit=.07;this.camera.upperBetaLimit=1.39;this.camera.wheelDeltaPercentage=.025;
    this.camera.panningSensibility=35;this.camera.minZ=.2;this.camera.maxZ=1500;
    this.terrainMat=atlasTerrainMaterial(this.scene);this.terrainMat.setFloat('relief',ATLAS_RELIEF);this.terrainMat.setFloat('grid',0);
    this.waterMat=atlasOceanMaterial(this.scene);this.waterMat.setFloat('speed',1);
    this.ocean=MeshBuilder.CreateGround('atlas-ocean',{width:ATLAS_SIZE,height:ATLAS_SIZE},this.scene);
    // Shader samples world X/Z before the translation is applied.
    this.ocean.material=this.waterMat;this.ocean.isPickable=false;
    this.cloudMat=atlasCloudMaterial(this.scene);
    this.clouds=MeshBuilder.CreateGround('atlas-cloud-layer',{width:ATLAS_SIZE,height:ATLAS_SIZE},this.scene);
    this.clouds.material=this.cloudMat;this.clouds.isPickable=false;this.clouds.position.y=18;
    canvas.addEventListener('wheel',(e)=>{e.preventDefault();if(e.ctrlKey){e.stopImmediatePropagation();this.camera.radius=Math.max(18,Math.min(430,this.camera.radius*Math.exp(e.deltaY*.002)));}},{passive:false,capture:true,signal:this.inputAbort.signal});
    canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal:this.inputAbort.signal});
    this.markers=new AtlasMarkers(this.scene);
    this.scene.onPointerObservable.add(info=>{
      const e=info.event as PointerEvent;
      if(info.type===PointerEventTypes.POINTERDOWN&&e.button===0){
        const picked=this.scene.pick(this.scene.pointerX,this.scene.pointerY);
        if(picked?.pickedMesh?.metadata?.atlasMarker){
          this.onPointer({phase:'start',x:0,z:0,markerId:picked.pickedMesh.metadata.atlasMarker});return;
        }
        if(!this.editing)return;
        this.dragging=true;canvas.setPointerCapture(e.pointerId);this.emit('start');
      }
      if(info.type===PointerEventTypes.POINTERMOVE){
        if(this.editing)this.previewBrush();
        if(this.dragging)this.emit('move');
      }
      if(info.type===PointerEventTypes.POINTERUP)this.release();
    });
    canvas.addEventListener('pointercancel',this.release);canvas.addEventListener('lostpointercapture',this.release);
    window.addEventListener('blur',this.release);
    this.resize=new ResizeObserver(()=>this.engine.resize());this.resize.observe(canvas);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.engine.runRenderLoop(()=>{
      const time=reduced?0:performance.now()*.001;
      this.waterMat.setFloat('time',time);this.cloudMat.setFloat('time',time);
      this.waterMat.setVector3('eye',this.camera.globalPosition);this.terrainMat.setVector3('eye',this.camera.globalPosition);this.scene.render();
    });
  }
  private emit(phase:'start'|'move'):void {
    const hit=this.scene.pick(this.scene.pointerX,this.scene.pointerY,m=>m.name.startsWith('atlas-chunk'));
    if(hit?.pickedPoint)this.onPointer({phase,x:hit.pickedPoint.x,z:hit.pickedPoint.z/(this.document!.heightKm/this.document!.widthKm)});
  }
  setBrushRadius(radius:number):void {this.brushRadius=radius;}
  private previewBrush():void {
    if(!this.document)return;
    const doc=this.document,aspect=doc.heightKm/doc.widthKm;
    const hit=this.scene.pick(this.scene.pointerX,this.scene.pointerY,m=>m.name.startsWith('atlas-chunk'));
    if(!hit?.pickedPoint){if(this.brushRing)this.brushRing.isVisible=false;return;}
    const x=hit.pickedPoint.x,z=hit.pickedPoint.z/aspect;
    const points=Array.from({length:65},(_,i)=>{
      const a=i/64*Math.PI*2,xx=x+Math.cos(a)*this.brushRadius,zz=z+Math.sin(a)*this.brushRadius/aspect;
      return new Vector3(xx,Math.max(doc.seaLevel,sampleAtlas(doc,xx,zz))*atlasRelief(doc)+.25,zz*aspect);
    });
    this.brushRing?.dispose();this.brushRing=MeshBuilder.CreateLines('atlas-brush',{points},this.scene);
    this.brushRing.color=Color3.FromHexString('#e3ce9c');this.brushRing.isPickable=false;
  }
  setEditing(editing:boolean):void {
    this.editing=editing;
    const pointers=this.camera.inputs.attached['pointers'] as unknown as {buttons:number[]};
    if(pointers)pointers.buttons=editing?[2]:[0,1,2];
    this.canvas.style.cursor=editing?'crosshair':'grab';
    if(this.brushRing)this.brushRing.isVisible=editing;
  }
  setView(top:boolean):void {this.camera.beta=top?.07:Math.PI*.28;this.camera.alpha=-Math.PI/2;}
  setClouds(enabled:boolean):void {this.clouds.setEnabled(enabled);}
  setGrid(enabled:boolean):void {this.terrainMat.setFloat('grid',enabled?1:0);}
  select(id:string|null,labels=true):void {this.selected=id;this.showLabels=labels;if(this.document)this.markers.rebuild(this.document,id,labels);}
  frameAll():void {this.camera.setTarget(Vector3.Zero());this.camera.radius=290;}
  focus(x:number,z:number):void {if(this.document)this.camera.setTarget(new Vector3(x,sampleAtlas(this.document,x,z)*atlasRelief(this.document),z*this.document.heightKm/this.document.widthKm));this.camera.radius=65;}
  update(doc:AtlasDocument):void {
    this.document=doc;for(const m of this.chunks)m.dispose();this.chunks=[];
    const n=doc.resolution,w=n+1,step=32,relief=atlasRelief(doc),aspect=doc.heightKm/doc.widthKm;
    this.terrainMat.setFloat('relief',relief);this.waterMat.setFloat('waveScale',Math.max(.8,Math.min(6,doc.widthKm/1600)));
    this.clouds.scaling.z=aspect;this.clouds.position.y=Math.max(...doc.heights)*relief+5;
    for(let startZ=0;startZ<n;startZ+=step)for(let startX=0;startX<n;startX+=step){
      const nx=Math.min(step,n-startX),nz=Math.min(step,n-startZ),positions:number[]=[],colors:number[]=[],indices:number[]=[],normals:number[]=[];
      for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
        const k=(startZ+z)*w+startX+x,h=doc.heights[k];
        positions.push(((startX+x)/n-.5)*ATLAS_SIZE,h*relief,((startZ+z)/n-.5)*ATLAS_SIZE);
        const color=Color3.FromHexString(ATLAS_BIOMES[doc.biomes[k]]?.color??ATLAS_BIOMES[0].color);
        colors.push(color.r,color.g,color.b,1);
        if(x<nx&&z<nz){const a=z*(nx+1)+x,b=a+nx+1;indices.push(a,a+1,b,a+1,b+1,b);}
      }
      // Neighbour samples cross chunk boundaries, so lighting has no tile seams.
      for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
        const gx=startX+x,gz=startZ+z;
        const dx=(doc.heights[gz*w+Math.min(n,gx+1)]-doc.heights[gz*w+Math.max(0,gx-1)])*relief/(2*ATLAS_SIZE/n);
        const dz=(doc.heights[Math.min(n,gz+1)*w+gx]-doc.heights[Math.max(0,gz-1)*w+gx])*relief/(2*ATLAS_SIZE/n*aspect);
        const normal=new Vector3(-dx,1,-dz).normalize();normals.push(normal.x,normal.y,normal.z);
      }
      const data=new VertexData();Object.assign(data,{positions,indices,normals,colors});
      const mesh=new Mesh(`atlas-chunk-${startX}-${startZ}`,this.scene);data.applyToMesh(mesh);mesh.material=this.terrainMat;mesh.scaling.z=doc.heightKm/doc.widthKm;this.chunks.push(mesh);
    }
    this.terrainMat.setFloat('sea',doc.seaLevel);this.waterMat.setFloat('sea',doc.seaLevel);
    this.ocean.position.y=doc.seaLevel*relief+.03;
    this.ocean.scaling.z=doc.heightKm/doc.widthKm;
    const elevation=new Float32Array(w*w);doc.heights.forEach((h,i)=>elevation[i]=(h+1)/4);
    this.texture?.dispose();this.texture=RawTexture.CreateRTexture(elevation,w,w,this.scene,false,false,Constants.TEXTURE_BILINEAR_SAMPLINGMODE,Constants.TEXTURETYPE_FLOAT);
    this.waterMat.setTexture('elevation',this.texture);
    this.markers.rebuild(doc,this.selected,this.showLabels);
  }
  async screenshot():Promise<Blob> {
    this.scene.render();return new Promise((resolve,reject)=>this.canvas.toBlob(b=>b?resolve(b):reject(new Error('Export failed.')),'image/png'));
  }
  dispose():void {
    this.inputAbort.abort();this.resize.disconnect();window.removeEventListener('blur',this.release);
    this.canvas.removeEventListener('pointercancel',this.release);this.canvas.removeEventListener('lostpointercapture',this.release);
    this.markers.dispose();this.scene.dispose();this.engine.dispose();
  }
}
