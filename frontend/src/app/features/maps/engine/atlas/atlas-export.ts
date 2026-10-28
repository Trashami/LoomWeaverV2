import { AtlasDocument, ATLAS_BIOMES } from './atlas-document';

/** Real raster cartography export, independent of WebGL and the camera. Hidden locations never enter it. */
export function atlasPreview(doc:AtlasDocument,size=768,playerSafe=true):HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=Math.round(size*doc.heightKm/doc.widthKm);
  const ctx=canvas.getContext('2d')!,image=ctx.createImageData(canvas.width,canvas.height),n=doc.resolution,w=n+1;
  const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const palette=ATLAS_BIOMES.map(b=>rgb(b.color));
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const ix=Math.min(n,Math.round(x/(canvas.width-1)*n)),iz=Math.min(n,Math.round((1-y/(canvas.height-1))*n)),k=iz*w+ix,h=doc.heights[k]-doc.seaLevel;
    const dx=doc.heights[iz*w+Math.min(n,ix+1)]-doc.heights[iz*w+Math.max(0,ix-1)];
    const dz=doc.heights[Math.min(n,iz+1)*w+ix]-doc.heights[Math.max(0,iz-1)*w+ix];
    let color=h<0?(h>-.04?[64,126,127]:[24,65,82]):h<.025?[183,171,121]:h>.72?[218,225,218]:palette[doc.biomes[k]];
    const shade=h<0?1:Math.max(.48,Math.min(1.25,1-dx*4-dz*5));const p=(y*canvas.width+x)*4;
    for(let i=0;i<3;i++)image.data[p+i]=color[i]*shade;image.data[p+3]=255;
  }
  ctx.putImageData(image,0,0);ctx.font=`bold ${Math.max(11,size/60)}px Georgia`;ctx.textAlign='center';
  for(const m of doc.markers){
    if(playerSafe&&m.visibility==='gm')continue;
    const x=(m.x/240+.5)*canvas.width,y=(.5-m.z/240)*canvas.height;
    ctx.fillStyle=m.color;ctx.strokeStyle='#05100c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeText(m.name,x,y-8);ctx.fillStyle='#f0e3bf';ctx.fillText(m.name,x,y-8);
  }
  return canvas;
}
export function downloadAtlasFile(blob:Blob,name:string):void {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
