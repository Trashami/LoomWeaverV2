import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { AtlasDocument, AtlasMarker, ATLAS_RELIEF } from './atlas-document';
import { sampleAtlas } from './atlas-terrain';

/** Asset-free miniatures: marker visuals are independent of the canonical campaign location ID. */
export class AtlasMarkers {
  private roots: TransformNode[]=[];
  private signature='';
  constructor(private readonly scene: Scene) {}
  rebuild(doc: AtlasDocument, selected: string | null, visible=true): void {
    const signature=JSON.stringify([doc.markers,selected,visible]);
    if(signature===this.signature){
      for(let i=0;i<this.roots.length;i++){
        const m=doc.markers[i];this.roots[i].position.y=Math.max(doc.seaLevel,sampleAtlas(doc,m.x,m.z))*ATLAS_RELIEF+.25;
        this.roots[i].position.z=m.z*doc.heightKm/doc.widthKm;
      }
      return;
    }
    this.dispose();this.signature=signature;if(!visible)return;
    for(const m of doc.markers) this.build(doc,m,m.id===selected);
  }
  private build(doc: AtlasDocument,m:AtlasMarker,selected:boolean):void {
    const root=new TransformNode('atlas-location-'+m.id,this.scene);this.roots.push(root);
    root.position=new Vector3(m.x,Math.max(doc.seaLevel,sampleAtlas(doc,m.x,m.z))*ATLAS_RELIEF+.25,m.z*doc.heightKm/doc.widthKm);
    const stone=new StandardMaterial('marker-stone',this.scene);stone.diffuseColor=Color3.FromHexString(m.color);stone.specularColor=Color3.Black();
    const roof=new StandardMaterial('marker-roof',this.scene);roof.diffuseColor=Color3.FromHexString('#493a39');
    const base=MeshBuilder.CreateCylinder('atlas-marker',{diameter:selected?4:3,height:.3,tessellation:32},this.scene);
    base.parent=root;base.material=stone;base.metadata={atlasMarker:m.id};
    const count=m.kind==='city'?7:m.kind==='town'?4:m.kind==='village'?3:1;
    for(let i=0;i<count;i++) {
      const angle=i*2.4,r=i?1:.0,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
      const tower=m.kind==='castle'||m.kind==='landmark',height=tower?3:m.kind==='ruin'?1:1.1+(i%3)*.4;
      const body=MeshBuilder.CreateBox('atlas-marker-building',{width:.7,depth:.7,height},this.scene);
      body.parent=root;body.position.set(x,height/2,z);body.material=stone;body.metadata={atlasMarker:m.id};
      if(m.kind!=='ruin') {
        const top=MeshBuilder.CreateCylinder('atlas-marker-roof',{diameterBottom:1.1,diameterTop:0,height:.7,tessellation:4},this.scene);
        top.parent=root;top.position.set(x,height+.35,z);top.rotation.y=Math.PI/4;top.material=roof;top.metadata={atlasMarker:m.id};
      }
    }
    const texture=new DynamicTexture('atlas-label',{width:512,height:80},this.scene,false);
    const ctx=texture.getContext() as CanvasRenderingContext2D;ctx.clearRect(0,0,512,80);ctx.fillStyle='rgba(5,16,12,.86)';ctx.fillRect(0,0,512,80);
    ctx.font='bold 32px Georgia';ctx.textAlign='center';ctx.fillStyle=selected?'#49e892':'#ead5aa';ctx.fillText(m.name.slice(0,36),256,49);texture.update();
    const labelMat=new StandardMaterial('atlas-label-material',this.scene);labelMat.diffuseTexture=texture;labelMat.opacityTexture=texture;labelMat.emissiveColor=Color3.White();labelMat.disableLighting=true;labelMat.backFaceCulling=false;
    const label=MeshBuilder.CreatePlane('atlas-marker-label',{width:11,height:1.72},this.scene);
    label.parent=root;label.position.y=5;label.billboardMode=Mesh.BILLBOARDMODE_ALL;label.material=labelMat;label.metadata={atlasMarker:m.id};
  }
  dispose():void { for(const r of this.roots)r.dispose(false,true);this.roots=[]; }
}
