import { AtlasBrush, AtlasDocument, AtlasTool, ATLAS_SIZE } from './atlas-document';

function hash(x: number, z: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t*t*(3-2*t);
export function noise(x: number, z: number, seed: number): number {
  const a=Math.floor(x),b=Math.floor(z),fx=x-a,fz=z-b;
  const fade=(t:number)=>t*t*t*(t*(t*6-15)+10),u=fade(fx),v=fade(fz);
  const gradient=(ix:number,iz:number,dx:number,dz:number)=>{const angle=hash(ix,iz,seed)*Math.PI*2;return Math.cos(angle)*dx+Math.sin(angle)*dz;};
  const top=gradient(a,b,fx,fz)*(1-u)+gradient(a+1,b,fx-1,fz)*u;
  const bottom=gradient(a,b+1,fx,fz-1)*(1-u)+gradient(a+1,b+1,fx-1,fz-1)*u;
  return Math.max(0,Math.min(1,.5+(top*(1-v)+bottom*v)*.8));
}
export function fractal(x: number, z: number, seed: number): number {
  let sum=0, weight=.55;
  for (let o=0;o<5;o++) { sum += noise(x,z,seed+o*71)*weight; x*=2.08;z*=2.08;weight*=.48; }
  return sum;
}
/** Connected, warped ranges with smaller tributary ridges, not independent spike noise. */
export function mountainField(x:number,z:number,seed:number):number {
  const warp=fractal(x*.55+17,z*.55-9,seed)*1.8;
  const main=1-Math.abs(noise(x*.57+z*.39+warp,z*.57-x*.39-warp,seed+91)*2-1);
  const branches=1-Math.abs(noise(x*2.1+warp,z*2.1,seed+171)*2-1);
  const tributaries=1-Math.abs(noise(x*4.5+warp,z*4.5-warp,seed+271)*2-1);
  return Math.pow(main,2)*(.45+.35*branches+.2*tributaries);
}
/** Conservative talus transport removes needle peaks without changing total elevation. */
export function weatherTerrain(heights:number[],n:number,passes=10):void {
  const w=n+1,threshold=5/n;
  for(let pass=0;pass<passes;pass++) {
    const delta=new Float64Array(heights.length);
    for(let z=1;z<n;z++)for(let x=1;x<n;x++) {
      const i=z*w+x;let low=i;
      for(const j of [i-1,i+1,i-w,i+w])if(heights[j]<heights[low])low=j;
      const excess=heights[i]-heights[low]-threshold;
      if(excess>0){const transfer=excess*.18;delta[i]-=transfer;delta[low]+=transfer;}
    }
    for(let i=0;i<heights.length;i++)heights[i]+=delta[i];
  }
}
/** Downslope drainage accumulates across tributaries and cuts branching valleys. */
export function carveDrainage(heights:number[],n:number,passes=3):void {
 const w=n+1,order=Array.from({length:heights.length},(_,i)=>i);
 for(let pass=0;pass<passes;pass++) {
  order.sort((a,b)=>heights[b]-heights[a]);const flow=new Float64Array(heights.length).fill(1),delta=new Float64Array(heights.length);
  for(const i of order){const x=i%w,z=Math.floor(i/w);if(!x||!z||x===n||z===n||heights[i]<=0)continue;
   let low=i;
   for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const j=i+dz*w+dx;if(heights[j]<heights[low])low=j;}
   if(low===i)continue;flow[low]+=flow[i];
   const cut=Math.min((heights[i]-heights[low])*.22,Math.log1p(flow[i])*.008);
   delta[i]-=cut;delta[low]+=cut*.65;
  }
  for(let i=0;i<heights.length;i++)heights[i]+=delta[i];
 }
}
export function createAtlas(seed = 7319, resolution = 256): AtlasDocument {
  const heights:number[]=[],biomes:number[]=[];
  for(let z=0;z<=resolution;z++)for(let x=0;x<=resolution;x++) {
    const u=x/resolution*2-1,v=z/resolution*2-1;
    const warp=fractal(u*3+11,v*3+13,seed)-.5;
    const coast=Math.min(Math.hypot((u+.23)*1.08,(v+.13)*1.42),Math.hypot((u-.34)*1.7,(v-.2)*1.35)) + warp*.52;
    const shelf=(1-coast)*.65-.23;
    const inland=smooth(Math.max(0,Math.min(1,shelf*5)));
    const belt=smooth(Math.max(0,Math.min(1,(noise(u*2.2+12,v*2.2-4,seed+81)-.34)*3.8)));
    const ranges=mountainField(u*7+8,v*7+9,seed)*belt;
    const hills=fractal(u*11,v*11,seed+47);
    heights.push(Math.max(-.8,shelf+inland*(ranges*.65+hills*.08+(fractal(u*42,v*42,seed+7)-.5)*.12*belt)));
    biomes.push(0);
  }
  carveDrainage(heights,resolution,8);
  weatherTerrain(heights,resolution,18);
  return {schemaVersion:1,id:crypto.randomUUID(),revision:0,name:'Untitled World',seed,resolution,
    widthKm:4800,heightKm:3600,seaLevel:0,heights,biomes,markers:[]};
}
export function sampleAtlas(doc: AtlasDocument, x: number, z: number): number {
  const n=doc.resolution, fx=Math.max(0,Math.min(n,(x/ATLAS_SIZE+.5)*n)), fz=Math.max(0,Math.min(n,(z/ATLAS_SIZE+.5)*n));
  const ix=Math.min(n-1,Math.floor(fx)), iz=Math.min(n-1,Math.floor(fz)), u=fx-ix,v=fz-iz,w=n+1;
  return (doc.heights[iz*w+ix]*(1-u)+doc.heights[iz*w+ix+1]*u)*(1-v)
    +(doc.heights[(iz+1)*w+ix]*(1-u)+doc.heights[(iz+1)*w+ix+1]*u)*v;
}
/** Stroke sampling is distance-based, independent of pointer event frequency. */
export function strokePoints(from: {x:number;z:number}, to: {x:number;z:number}, radius: number): {x:number;z:number}[] {
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/Math.max(.3,radius*.18)));
  return Array.from({length:steps},(_,i)=>({x:from.x+(to.x-from.x)*(i+1)/steps,z:from.z+(to.z-from.z)*(i+1)/steps}));
}
export function applyAtlasBrush(doc: AtlasDocument, tool: AtlasTool, x: number, z: number, brush: AtlasBrush): void {
  const n=doc.resolution,w=n+1,r=Math.max(.5,brush.radius), old=tool==='smooth'?doc.heights.slice():doc.heights;
  const cx=(x/ATLAS_SIZE+.5)*n, cz=(z/ATLAS_SIZE+.5)*n, cells=r/ATLAS_SIZE*n;
  for(let iz=Math.max(0,Math.floor(cz-cells*doc.widthKm/doc.heightKm));iz<=Math.min(n,Math.ceil(cz+cells*doc.widthKm/doc.heightKm));iz++) {
    for(let ix=Math.max(0,Math.floor(cx-cells));ix<=Math.min(n,Math.ceil(cx+cells));ix++) {
      const d=Math.hypot(ix-cx,(iz-cz)*doc.heightKm/doc.widthKm)/cells;if(d>1)continue;
      const inner=1-brush.feather, fade=d<=inner?1:1-smooth((d-inner)/Math.max(.001,1-inner));
      const k=iz*w+ix, amount=brush.strength*fade*.075;
      if(tool==='biome') { if(fade>.15)doc.biomes[k]=brush.biome;continue; }
      let h=old[k];
      if(tool==='raise')h+=amount;
      if(tool==='lower')h-=amount;
      if(tool==='mountains')h+=amount*(.55+mountainField(ix/n*14,iz/n*14,doc.seed)*1.6)*Math.max(.15,1-Math.max(0,h)*.45);
      if(tool==='flatten')h+=(brush.flattenHeight-h)*Math.min(1,amount*5);
      if(tool==='smooth') {
        let sum=0,count=0;
        for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
          const xx=Math.max(0,Math.min(n,ix+dx)),zz=Math.max(0,Math.min(n,iz+dz));sum+=old[zz*w+xx];count++;
        }
        h+=(sum/count-h)*Math.min(1,amount*12);
      }
      doc.heights[k]=Math.max(-1,Math.min(3,h));
    }
  }
}
