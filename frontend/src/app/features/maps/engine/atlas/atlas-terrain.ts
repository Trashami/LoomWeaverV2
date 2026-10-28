import { AtlasBrush, AtlasDocument, AtlasTool, ATLAS_SIZE } from './atlas-document';

function hash(x: number, z: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t*t*(3-2*t);
function noise(x: number, z: number, seed: number): number {
  const a = Math.floor(x), b = Math.floor(z), u = smooth(x-a), v = smooth(z-b);
  return (hash(a,b,seed)*(1-u)+hash(a+1,b,seed)*u)*(1-v)
    +(hash(a,b+1,seed)*(1-u)+hash(a+1,b+1,seed)*u)*v;
}
export function fractal(x: number, z: number, seed: number): number {
  let sum=0, weight=.55;
  for (let o=0;o<5;o++) { sum += noise(x,z,seed+o*71)*weight; x*=2.08;z*=2.08;weight*=.48; }
  return sum;
}
export function createAtlas(seed = 7319, resolution = 192): AtlasDocument {
  const heights: number[] = [], biomes: number[] = [];
  for (let z=0;z<=resolution;z++) for (let x=0;x<=resolution;x++) {
    const u=x/resolution*2-1, v=z/resolution*2-1;
    const coast = Math.hypot(u*.91,v*1.12) + (fractal(u*3+11,v*3+13,seed)-.5)*.6;
    const ridge = Math.pow(1-Math.abs(noise(u*6+8,v*6+9,seed+91)*2-1),3);
    const inland = Math.max(0, 1-coast*1.8);
    heights.push(Math.max(-.65, (1-coast)*.75-.23 + ridge*inland*.95 + (fractal(u*13,v*13,seed)-.5)*inland*.22));
    biomes.push(0);
  }
  return { schemaVersion:1,id:crypto.randomUUID(),revision:0,name:'Untitled World',seed,resolution,
    widthKm:1200,heightKm:900,seaLevel:0,heights,biomes,markers:[] };
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
  for(let iz=Math.max(0,Math.floor(cz-cells));iz<=Math.min(n,Math.ceil(cz+cells));iz++) {
    for(let ix=Math.max(0,Math.floor(cx-cells));ix<=Math.min(n,Math.ceil(cx+cells));ix++) {
      const d=Math.hypot(ix-cx,iz-cz)/cells;if(d>1)continue;
      const inner=1-brush.feather, fade=d<=inner?1:1-smooth((d-inner)/Math.max(.001,1-inner));
      const k=iz*w+ix, amount=brush.strength*fade*.075;
      if(tool==='biome') { if(fade>.15)doc.biomes[k]=brush.biome;continue; }
      let h=old[k];
      if(tool==='raise')h+=amount;
      if(tool==='lower')h-=amount;
      if(tool==='mountains')h+=amount*(.45+Math.pow(1-Math.abs(noise(ix*.13,iz*.13,doc.seed)*2-1),3)*2.7);
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
