import { Mesh, Scene, VertexData } from '@babylonjs/core';
import type { WaterProfile } from './water-profile';
import { sampleWaterNetwork, WaterField } from './water-network-field';
interface Point {x:number;z:number;field:WaterField;}
/** Clip a regular surface grid to the union outline. There are no overlapping caps or internal shorelines. */
export function createWaterNetworkMesh(scene:Scene,profiles:readonly WaterProfile[]):Mesh {
  const points=profiles.flatMap(p=>p.samples);
  const radius=Math.max(...profiles.map(p=>p.settings.width/2))+1;
  const minX=Math.min(...points.map(p=>p.x))-radius,maxX=Math.max(...points.map(p=>p.x))+radius;
  const minZ=Math.min(...points.map(p=>p.z))-radius,maxZ=Math.max(...points.map(p=>p.z))+radius;
  const cell=Math.max(.18,Math.min(.35,Math.min(...profiles.map(p=>p.settings.width))/10));
  const cols=Math.ceil((maxX-minX)/cell),rows=Math.ceil((maxZ-minZ)/cell);
  const grid:Point[]=[];
  for(let iz=0;iz<=rows;iz++) for(let ix=0;ix<=cols;ix++) {
    const x=minX+ix*cell,z=minZ+iz*cell;grid.push({x,z,field:sampleWaterNetwork(profiles,x,z)});
  }
  const positions:number[]=[],normals:number[]=[],indices:number[]=[],uvs:number[]=[],water:number[]=[],flow:number[]=[],shallow:number[]=[],deep:number[]=[],style:number[]=[];
  const cache=new Map<string,number>();
  const vertex=(p:Point):number=>{
    const key=p.x.toFixed(5)+','+p.z.toFixed(5),existing=cache.get(key);
    if(existing!==undefined)return existing;
    const f=p.field,s=f.settings,index=positions.length/3;
    positions.push(p.x,f.level+.018,p.z);uvs.push(p.x,p.z);
    water.push(f.depth,f.fall,f.speed>0?1:0,0);
    flow.push(f.dx,f.dz,f.speed,s.refraction);shallow.push(...f.shallow,s.opacity);
    deep.push(...f.deep,s.reflectivity);style.push(s.intensity,s.foam,s.waveScale,Math.min(s.waveHeight,s.depth*.08));
    cache.set(key,index);return index;
  };
  const clip=(triangle:Point[])=>{
    const polygon:Point[]=[];
    for(let i=0;i<3;i++) {
      const a=triangle[i],b=triangle[(i+1)%3],inside=a.field.coverage>=0;
      if(inside)polygon.push(a);
      if(inside!==(b.field.coverage>=0)) {
        const t=a.field.coverage/(a.field.coverage-b.field.coverage);
        const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
        polygon.push({x,z,field:{...sampleWaterNetwork(profiles,x,z),coverage:0,depth:0}});
      }
    }
    if(polygon.length<3)return;
    const a=vertex(polygon[0]);
    for(let i=1;i<polygon.length-1;i++) indices.push(a,vertex(polygon[i]),vertex(polygon[i+1]));
  };
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++) {
    const a=z*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;
    clip([grid[a],grid[b],grid[c]]);clip([grid[b],grid[d],grid[c]]);
  }
  VertexData.ComputeNormals(positions,indices,normals);
  const mesh=new Mesh('lw-water-spline-network-'+profiles[0].id,scene),data=new VertexData();
  data.positions=positions;data.normals=normals;data.indices=indices;data.uvs=uvs;data.applyToMesh(mesh);
  mesh.setVerticesData('waterData',water,false,4);mesh.setVerticesData('waterFlow',flow,false,4);
  mesh.setVerticesData('waterShallow',shallow,false,4);mesh.setVerticesData('waterDeep',deep,false,4);mesh.setVerticesData('waterStyle',style,false,4);
  mesh.isPickable=false;return mesh;
}
