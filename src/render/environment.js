import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight, surfaceAt } from '../game/courses.js';

const TAU=Math.PI*2;
function random(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
const smooth=(a,b,t)=>a+(b-a)*t;
export function disposeObject(object){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 object.traverse(child=>{if(child.geometry)geometries.add(child.geometry);for(const m of (Array.isArray(child.material)?child.material:[child.material]))if(m){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();object.removeFromParent();
}

/** Bakes procedural resort scenery into a small number of static draw calls. */
export function createEnvironment(hole){
 const group=new THREE.Group();group.name='coastal-course';
 const rnd=random(6157+Number(hole.id||1)*37); const mats=new Map(), batches=new Map();
 const material=(color,roughness=1)=>{if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness}));return mats.get(color);};
 const add=(geometry,color,position,scale=[1,1,1],rotation=[0,0,0])=>{
   const m=new THREE.Mesh(geometry,material(color));m.position.set(...position);m.scale.set(...scale);m.rotation.set(...rotation);m.updateMatrix();geometry.applyMatrix4(m.matrix);
   if(!batches.has(color))batches.set(color,[]);batches.get(color).push(geometry);
 };
 const sphere=(c,x,y,z,sx,sy,sz,detail=1)=>add(new THREE.IcosahedronGeometry(1,detail),c,[x,y,z],[sx,sy,sz]);
 const box=(c,x,y,z,sx,sy,sz,rot=0)=>add(new THREE.BoxGeometry(sx,sy,sz),c,[x,y,z],[1,1,1],[0,rot,0]);
 const cylinder=(c,a,b,ra,rb=ra,segments=8)=>{
   const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);
   const g=new THREE.CylinderGeometry(rb,ra,delta.length(),segments);const m=new THREE.Matrix4().compose(av.add(bv).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()),new THREE.Vector3(1,1,1));g.applyMatrix4(m);
   if(!batches.has(c))batches.set(c,[]);batches.get(c).push(g);
 };
 const h=(x,z)=>terrainHeight(hole,x,z);
 const zMin=-60,zMax=hole.length+82,xMin=-111,xMax=111;
 const nx=148,nz=Math.ceil((zMax-zMin)/1.75);
 const terrain=new THREE.PlaneGeometry(xMax-xMin,zMax-zMin,nx,nz);terrain.rotateX(-Math.PI/2);terrain.translate(0,0,(zMax+zMin)/2);
 const pos=terrain.attributes.position,colors=[];
 const palette={tee:'#79b740',fairway:'#6caf37',green:'#83c44b',rough:'#548f35',sand:'#f4dfab',water:'#209fa5',out:'#4e8739'};
 const c=new THREE.Color();
 for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i),s=surfaceAt(hole,{x,z});pos.setY(i,h(x,z));
   c.set(palette[s]||palette.rough);
   const stripe=(s==='fairway'||s==='tee')?((Math.floor((z+x*.28)/12)%2)===0?.028:-.01):0;
   const noise=Math.sin(x*3.17+z*2.77)*Math.cos(z*1.3)*.013;
   c.offsetHSL(0,0,stripe+noise);colors.push(c.r,c.g,c.b);
 }
 terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrain.computeVertexNormals();
 const grain=new Uint8Array(64*64*4);for(let i=0;i<64*64;i++){const v=226+Math.floor(rnd()*29);grain.set([v,v,v,255],i*4);}
 const texture=new THREE.DataTexture(grain,64,64);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(105,(zMax-zMin)*.48);texture.needsUpdate=true;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
 const land=new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({vertexColors:true,map:texture,roughness:1}));land.receiveShadow=true;group.add(land);
 // Conforming rounded boundaries keep hazards and putting greens geographically exact.
 function patch(x,z,rx,rz,hex,offset=.045,rings=8,allowedSurface=null){
   const positions=[],indices=[],count=80;
   for(let ring=0;ring<=rings;ring++)for(let j=0;j<=count;j++){
     const a=j/count*TAU,r=ring/rings,px=x+Math.cos(a)*rx*r,pz=z+Math.sin(a)*rz*r;
     positions.push(px,h(px,pz)+offset,pz);
   }
   for(let ring=0;ring<rings;ring++)for(let j=0;j<count;j++){
     const a=ring*(count+1)+j,b=a+count+1;
     for(const tri of [[a,b,a+1],[a+1,b,b+1]]){
       const x=tri.reduce((sum,index)=>sum+positions[index*3],0)/3,z=tri.reduce((sum,index)=>sum+positions[index*3+2],0)/3;
       if(!allowedSurface||surfaceAt(hole,{x,z})===allowedSurface)indices.push(...tri);
     }
   }
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
   const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:hex,roughness:1,side:THREE.DoubleSide}));m.receiveShadow=true;group.add(m);return m;
 }
 patch(hole.pin.x,hole.pin.z,hole.greenRadius+1.0,hole.greenRadius+1.0,'#659d36',.03);
 patch(hole.pin.x,hole.pin.z,hole.greenRadius,hole.greenRadius,'#87c449',.06);
 for(const b of hole.bunkers){patch(b.x,b.z,b.rx+.6,b.rz+.6,'#c8bb7c',.05);patch(b.x,b.z,b.rx,b.rz,'#f3deb1',.09,8,'sand');}
 const waters=[];
 for(const p of hole.ponds){patch(p.x,p.z,p.rx+.8,p.rz+.8,'#c5c18b',.07);const water=patch(p.x,p.z,p.rx,p.rz,'#2babb4',.12);water.material.roughness=.3;water.material.metalness=.13;waters.push(water);}
 // Sandy rock shelf under the playable plateau.
 for(const side of [-1,1]){
   for(let z=zMin;z<zMax;z+=13){
     const x=side*(113+rnd()*5),y=h(side*104,z);
     sphere('#d6c393',x,y-5,z,8+rnd()*5,6+rnd()*3,11,1);
     sphere('#e6d3a7',x+side*2,y-7,z+4,8,3.6,9,0);
   }
 }
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000),new THREE.MeshStandardMaterial({color:'#30bbc8',roughness:.28,metalness:.16}));sea.rotation.x=-Math.PI/2;sea.position.set(0,-8.7,hole.length/2);sea.receiveShadow=true;group.add(sea);
 // Thin glints and broken foam along the coast, all physical scenery.
 for(let i=0;i<180;i++){
   const side=i%2?1:-1,x=side*(127+rnd()*600),z=-120+rnd()*(hole.length+650);
   box(i%4?'#7bdfdc':'#e5fbec',x,-8.57,z,2+rnd()*8,.012,.08+rnd()*.15,.15);
 }
 function palm(x,z,scale=1,baseY=h(x,z)){
   const height=(9+rnd()*5)*scale,lean=(rnd()-.5)*2.5*scale;
   const tip=[x+lean,baseY+height,z];
   cylinder('#a08351',[x,baseY,z],[x+lean*.35,baseY+height*.53,z],.40*scale,.29*scale,9);
   cylinder('#ac8952',[x+lean*.35,baseY+height*.53,z],tip,.29*scale,.19*scale,9);
   for(let j=0;j<7;j++){
     const a=j/7*TAU+rnd()*.2,len=(4+rnd()*1.4)*scale;
     const vertices=[],indices=[];
     for(let k=0;k<=8;k++){
       const f=k/8,r=len*f,y=tip[1]+Math.sin(f*Math.PI)*1.1*scale-f*f*2.2*scale,w=Math.sin(Math.PI*f)*.55*scale;
       for(const side of [-1,1])vertices.push(tip[0]+Math.cos(a)*r+Math.sin(a)*w*side,y,z+Math.sin(a)*r-Math.cos(a)*w*side);
       if(k<8){const q=k*2;indices.push(q,q+1,q+2,q+1,q+3,q+2);}
     }
     const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
     const hex=j%2?'#3e7f36':'#64a139';if(!batches.has(hex))batches.set(hex,[]);batches.get(hex).push(g);
   }
   for(let j=0;j<3;j++)sphere('#7a6935',tip[0]+Math.sin(j*2)*.3*scale,tip[1]-.3*scale,z+Math.cos(j*2)*.3*scale,.3*scale,.36*scale,.3*scale);
 }
 function tree(x,z,scale=1){
   const y=h(x,z);cylinder('#796044',[x,y,z],[x,y+4.5*scale,z],.35*scale,.2*scale);
   for(let j=0;j<4;j++)sphere(j%2?'#498243':'#659844',x+Math.sin(j*2.4)*1.5*scale,y+(4.8+j*.4)*scale,z+Math.cos(j*2.4)*1.3*scale,2.5*scale,2.1*scale,2.6*scale,1);
 }
 for(let i=0;i<64;i++){
   const z=-28+rnd()*(hole.length+76),side=i%2?1:-1,x=side*(46+rnd()*52);
   if(surfaceAt(hole,{x,z})==='rough'||surfaceAt(hole,{x,z})==='out') {if(i%4) palm(x,z,.85+rnd()*.40);else tree(x,z,1.2+rnd()*.8);}
 }
 // Foreground framing palms and flowering beds.
 palm(-15,-9,1.1);palm(24,11,1.2);palm(-37,22,1.3);
 for(let i=0;i<105;i++){
   const x=(i%2?1:-1)*(40+rnd()*60),z=-30+rnd()*(hole.length+80),y=h(x,z);
   if(surfaceAt(hole,{x,z})!=='rough')continue;
   sphere(i%3?'#417a3e':'#709842',x,y+.45,z,1+rnd()*1.5,.65,1.1,0);
   if(i%3===0)for(let j=0;j<4;j++)sphere(j%2?'#e78681':'#fff0b6',x+Math.sin(j*2)*.7,y+1,z+Math.cos(j*2)*.65,.24,.24,.24,0);
 }
 function house(x,y,z,scale,roof){
   box('#f6edda',x,y+2.4*scale,z,7*scale,4.8*scale,5.5*scale);
   const roofGeometry=new THREE.CylinderGeometry(0,5.15*scale,2.2*scale,4,1);roofGeometry.rotateY(Math.PI/4);add(roofGeometry,roof,[x,y+5.7*scale,z],[1,1,.84]);
   for(const side of [-1,1])for(const offset of [-1.7,1.7])box('#36778a',x+offset*scale,y+2.7*scale,z+side*2.765*scale,1.15*scale,1.65*scale,.06*scale);
   box('#315a63',x,y+1.3*scale,z-2.78*scale,1.2*scale,2.6*scale,.05);
 }
 const villageX=-178,villageZ=hole.length*.68;
 sphere('#779678',villageX,-7,villageZ,73,34,77,1);
 sphere('#dfceb2',villageX,-14,villageZ,84,32,83,1);
 sphere('#74a254',villageX,6,villageZ,57,20,65,1);
 for(let i=0;i<13;i++){
   const x=villageX+(rnd()-.5)*68,z=villageZ+(rnd()-.5)*66,y=7+20*Math.sqrt(Math.max(.1,1-((x-villageX)/57)**2-((z-villageZ)/65)**2));
   house(x,y,z,.7+rnd()*.45,i%2?'#cb7857':'#e49b6d');
 }
 const lx=villageX-9,lz=villageZ+17,ly=25;
 cylinder('#f8efdc',[lx,ly,lz],[lx,ly+22,lz],3.0,2.0,18);
 cylinder('#d7654f',[lx,ly+14,lz],[lx,ly+17,lz],2.4,2.25,18);
 cylinder('#294e61',[lx,ly+22,lz],[lx,ly+25,lz],2.4,2.4,14);
 cylinder('#f6e7bf',[lx,ly+22.4,lz],[lx,ly+24.6,lz],1.9,1.9,14);
 add(new THREE.ConeGeometry(3.5,3.5,18),'#d76b51',[lx,ly+26.5,lz]);
 for(let i=0;i<7;i++){
   const x=(i-3)*180,z=hole.length+490+rnd()*380;
   sphere(i%2?'#649caa':'#80afba',x,-20,z,110+rnd()*80,32+rnd()*40,90,2);
   sphere('#a3c5c3',x+25,-18,z-15,60,25+rnd()*45,65,1);
 }
 for(let i=0;i<8;i++){
   const x=(i%2?1:-1)*(180+rnd()*320),z=rnd()*(hole.length+350),y=-8.3;
   sphere('#f9f2df',x,y,z,2.4,.55,5.5,0);cylinder('#f2ede0',[x,y,z],[x,y+15,z],.09,.09,5);
   const sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([x+.3,y+1,z,x+.3,y+14,z,x+6,y+1,z],3));sail.computeVertexNormals();if(!batches.has('#fff8e7'))batches.set('#fff8e7',[]);batches.get('#fff8e7').push(sail);
 }
 // Tee furniture and physical hole flag.
 for(const x of [-3,3]){const y=h(hole.tee.x+x,hole.tee.z);box('#226779',hole.tee.x+x,y+.12,hole.tee.z,.48,.24,.48);box('#f6ead0',hole.tee.x+x,y+.247,hole.tee.z,.28,.016,.12);}
 const signX=hole.tee.x-30,signZ=hole.tee.z+12;
 box('#ab8150',signX,h(signX,signZ)+.8,signZ,.95,1.6,.24);
 box('#f5deb2',signX,h(signX,signZ)+1.2,signZ-.13,.48,.07,.03);
 const py=h(hole.pin.x,hole.pin.z);
 cylinder('#f8f3da',[hole.pin.x,py,hole.pin.z],[hole.pin.x,py+6.1,hole.pin.z],.075,.055,8);
 cylinder('#1e4049',[hole.pin.x,py+.07,hole.pin.z],[hole.pin.x,py+.095,hole.pin.z],.31,.31,20);
 const flagGeometry=new THREE.PlaneGeometry(2.35,1.4,8,3);flagGeometry.translate(1.17,0,0);
 const flag=new THREE.Mesh(flagGeometry,new THREE.MeshStandardMaterial({color:'#f06b4d',side:THREE.DoubleSide,roughness:1}));flag.position.set(hole.pin.x,py+5.25,hole.pin.z);flag.castShadow=true;group.add(flag);
 for(const [hex,geometries]of batches){
   // Some primitive geometries carry UVs and others do not. Static scenery needs normals only.
   for(const g of geometries){for(const key of Object.keys(g.attributes))if(key!=='position'&&key!=='normal')g.deleteAttribute(key);}
   const nonindexed=geometries.map(g=>g.index?g.toNonIndexed():g);
   const combined=mergeGeometries(nonindexed,false);const mat=material(hex);mat.side=THREE.DoubleSide;
   const m=new THREE.Mesh(combined,mat);m.castShadow=true;m.receiveShadow=true;group.add(m);
   for(const g of new Set([...geometries,...nonindexed]))g.dispose();
 }
 group.userData.animate=(time,reduced)=>{
   const p=flag.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i);p.setZ(i,reduced?0:Math.sin(x*2.7-time*3)*.13*(x/2.35));}p.needsUpdate=true;
 };
 return group;
}

export function createSky(){
 const group=new THREE.Group();group.name='sky';
 const uniforms={top:{value:new THREE.Color('#329be7')},bottom:{value:new THREE.Color('#d9f3ef')}};
 const sky=new THREE.Mesh(new THREE.SphereGeometry(2500,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,toneMapped:false,uniforms,vertexShader:'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vPos; uniform vec3 top;uniform vec3 bottom;void main(){float h=clamp(normalize(vPos).y*1.5,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(h,.24)),1.);\n#include <colorspace_fragment>\n}'}));group.add(sky);
 const cloudMat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1});const rnd=random(77);
 for(let i=0;i<14;i++){
   const x=(rnd()-.5)*1800,y=200+rnd()*150,z=100+rnd()*1300;
   for(let j=0;j<5;j++){const cloud=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),cloudMat);cloud.position.set(x+(j-2)*17,y+Math.sin(j)*8,z);cloud.scale.set(25,11+rnd()*13,16);group.add(cloud);}
 }
 return group;
}
