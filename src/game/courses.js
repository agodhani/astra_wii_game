export const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const layouts = [
  ['Welcome to Blue Bay',4,310,[[0,0],[-12,95],[18,200],[8,310]],[[33,270,13,20],[-17,302,11,15]],[]],
  ['Palm Cove',3,155,[[0,0],[5,75],[-12,155]],[[10,151,12,17]],[[40,92,22,33]]],
  ['The Lighthouse',4,345,[[0,0],[-32,130],[-15,230],[30,345]],[[-2,312,14,20],[43,322,12,15]],[[47,150,23,35]]],
  ['Coral Crossing',5,440,[[0,0],[26,130],[36,250],[-24,360],[-30,440]],[[9,398,13,22],[-50,432,10,17]],[[ -53,220,19,38]]],
  ['Garden Green',3,180,[[0,0],[-10,95],[18,180]],[[0,163,11,17],[38,174,10,16]],[]],
  ['Sailor’s Bend',4,330,[[0,0],[37,110],[48,190],[-2,330]],[[20,309,13,17]],[[ -26,200,25,40]]],
  ['Golden Sands',4,365,[[0,0],[-26,125],[7,260],[35,365]],[[-6,174,14,20],[17,331,14,17],[57,355,13,19]],[]],
  ['Island Breeze',3,165,[[0,0],[8,90],[-18,165]],[[4,165,10,16]],[[36,105,22,32],[-51,85,19,25]]],
  ['Sunset Home',5,460,[[0,0],[-25,115],[-15,245],[30,340],[0,460]],[[25,425,12,20],[-21,444,11,17]],[[52,245,20,34]]],
];
export const HOLES = layouts.map(([name,par,length,path,bunkers,ponds],id)=>({
  id,name,par,length,tee:{x:0,z:0},pin:{x:path.at(-1)[0],z:length},path:path.map(([x,z])=>({x,z})),
  width:21+(id%3)*2,greenRadius:18,bunkers:bunkers.map(([x,z,rx,rz])=>({x,z,rx,rz})),ponds:ponds.map(([x,z,rx,rz])=>({x,z,rx,rz})),
  wind:{x:[1.2,-1,2,0.7,-0.6,1.6,-1.7,2.3,1.1][id],z:[0.5,1,-0.3,-1,0.4,-0.8,1,0.7,-0.7][id]},
}));
export function segmentDistance(p,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
export function fairwayDistance(hole,p){return Math.min(...hole.path.slice(1).map((b,i)=>segmentDistance(p,hole.path[i],b)));}
export const inEllipse=(p,e)=>((p.x-e.x)/e.rx)**2+((p.z-e.z)/e.rz)**2<1;
export function surfaceAt(hole,p){
  if(p.x < -105 || p.x > 105 || p.z < -55 || p.z > hole.length+65)return 'out';
  if(hole.ponds.some(e=>inEllipse(p,e)))return 'water';
  if(distance(p,hole.pin)<hole.greenRadius)return 'green';
  if(hole.bunkers.some(e=>inEllipse(p,e)))return 'sand';
  if(distance(p,hole.tee)<7)return 'tee';
  if(fairwayDistance(hole,p)<hole.width)return 'fairway';
  return 'rough';
}
export function terrainHeight(hole,x,z){
  if(hole.flat)return 0;
  const base=(a,b)=>2+Math.sin(b/54)*1.25+Math.sin(a/37)*0.6+Math.sin(b/115+a/70)*0.8;
  const d=Math.hypot(x-hole.pin.x,z-hole.pin.z),mix=Math.max(0,1-d/(hole.greenRadius*1.5));
  const green=base(hole.pin.x,hole.pin.z)+(x-hole.pin.x)*0.006+(z-hole.pin.z)*0.003;
  return base(x,z)*(1-mix)+green*mix;
}
