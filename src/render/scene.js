import * as THREE from 'three';
import { createAvatar } from './avatar.js';
import { createEnvironment, createSky, disposeObject } from './environment.js';
import { terrainHeight } from '../game/courses.js';

const clamp=THREE.MathUtils.clamp;
export class GolfScene {
 constructor(canvas,{onError}={}){
  this.canvas=canvas;this.onError=onError;this.time=0;this.mode='menu';this.quality='high';this.reducedMotion=false;this.aim=0;this.orbitYaw=0;this.orbitPitch=0;this.avatarYaw=0;this.ballPoint={x:0,z:0};this.shot=null;this.celebration=0;this.disposed=false;
  this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog('#b4dfe8',550,2000);
  this.camera=new THREE.PerspectiveCamera(49,1,.1,4000);this.camera.position.set(0,16,-25);
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.91;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.setClearColor('#8dcfde');
  const hemi=new THREE.HemisphereLight('#d7f3ff','#819647',1.3);this.scene.add(hemi);
  const ambient=new THREE.AmbientLight('#fff3df',.5);this.scene.add(ambient);
  this.sun=new THREE.DirectionalLight('#fff1d3',2.7);this.sun.position.set(-65,110,-45);this.sun.castShadow=true;
  this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-65;this.sun.shadow.camera.right=65;this.sun.shadow.camera.top=70;this.sun.shadow.camera.bottom=-70;this.sun.shadow.camera.near=1;this.sun.shadow.camera.far=260;this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.06;
  this.scene.add(this.sun,this.sun.target);
  this.sky=createSky();this.scene.add(this.sky);
  const ballGeo=new THREE.SphereGeometry(.22,20,14);
  this.ball=new THREE.Mesh(ballGeo,new THREE.MeshStandardMaterial({color:'#fffef2',roughness:.36}));this.ball.castShadow=true;this.scene.add(this.ball);
  // The glow is attached to the actual moving ball, never a predicted position.
  this.ballHalo=new THREE.Mesh(new THREE.SphereGeometry(.28,14,10),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.15,depthWrite:false}));this.ball.add(this.ballHalo);
  // Shot tracer: one tube along the airborne path, revealed with the real ball.
  this.tracerMaterial=new THREE.MeshBasicMaterial({color:'#fff3c4',transparent:true,opacity:.9,depthWrite:false});this.tracer=null;
  this.landingRing=new THREE.Mesh(new THREE.RingGeometry(.7,1,40),new THREE.MeshBasicMaterial({color:'#fff6d6',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
  this.landingRing.rotation.x=-Math.PI/2;this.landingRing.visible=false;this.ringAge=0;this.scene.add(this.landingRing);
  this.lookAt=new THREE.Vector3();this.desiredPosition=new THREE.Vector3();this.desiredLookAt=new THREE.Vector3();this.initialCamera=true;
  this.contextLost=event=>{event.preventDefault();onError?.('The 3D view was interrupted. Reload the page to restore it; your round is saved.');};canvas.addEventListener('webglcontextlost',this.contextLost);
  this.resizeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>this.resize()):null;this.resizeObserver?.observe(canvas);this.resize();
 }
 setHole(hole){
  if(!hole)return;
  if(this.environment)disposeObject(this.environment);
  this.hole=hole;this.environment=createEnvironment(hole);this.scene.add(this.environment);this.shot=null;this.clearTracer();this.setBall(hole.tee);this.resetView();
 }
 setPlayer(profile){
  if(this.avatar)disposeObject(this.avatar);
  this.profile=profile;this.avatar=createAvatar(profile);this.scene.add(this.avatar);this.placeAvatar();
 }
 setBall(point){
  if(!point)return;this.ballPoint={x:point.x,z:point.z};
  this.ball.position.set(point.x,this.ground(point.x,point.z)+.23,point.z);this.ball.visible=true;this.placeAvatar();
 }
 ground(x,z){return this.hole?terrainHeight(this.hole,x,z):0;}
 setAim(radians){if(Number.isFinite(radians)){this.aim=radians;this.placeAvatar();}}
 placeAvatar(){
  if(!this.avatar)return;
  const b=this.ballPoint;
  if(this.mode==='avatar'){
   const p=this.hole?.tee||b;this.avatar.position.set(p.x,this.ground(p.x,p.z),p.z);this.avatar.rotation.y=Math.PI+this.avatarYaw;
  }else{
   const x=b.x+Math.cos(this.aim)*2.7,z=b.z-Math.sin(this.aim)*2.7;
   this.avatar.position.set(x,this.ground(x,z),z);this.avatar.rotation.y=-Math.PI/2+this.aim;
  }
 }
 orbit(dx,dy){
  if(this.mode==='avatar'){this.avatarYaw+=dx*.009;this.placeAvatar();}
  else{this.orbitYaw-=dx*.006;this.orbitPitch=clamp(this.orbitPitch+dy*.004,-.20,.7);}
 }
 resetView(){this.orbitYaw=0;this.orbitPitch=0;this.initialCamera=true;}
 setMode(mode){
  if(!['menu','play','avatar'].includes(mode))return;
  this.mode=mode;this.shot=null;this.clearTracer();this.initialCamera=true;this.ball.visible=mode==='play';this.avatarYaw=0;this.placeAvatar();
  if(this.avatar)this.avatar.visible=mode!=='menu';this.resize();
 }
 setQuality(quality){
  this.quality=['low','medium','high'].includes(quality)?quality:'high';
  this.renderer.shadowMap.enabled=this.quality!=='low';
  const size=this.quality==='high'?2048:1024;this.sun.shadow.mapSize.set(size,size);
  if(this.sun.shadow.map){this.sun.shadow.map.dispose();this.sun.shadow.map=null;}
  this.resize();
 }
 setReducedMotion(value){this.reducedMotion=!!value;}
 animateShot(result,onComplete){
  if(!result?.path?.length){this.setBall(result?.end||this.ballPoint);onComplete?.();return;}
  const landingT=result.path[result.landingPathIndex]?.t||0;
  this.shot={result,onComplete,elapsed:0,sim:0,tail:0,index:0,landingT,landed:false,duration:Math.max(.01,result.path.at(-1).t||3),followStarted:false};this.celebration=0;
  this.buildTracer(result);
 }
 // Jump straight to the resolved result. The outcome is already simulated, so skipping only saves waiting.
 skipShot(){if(this.shot)this.shot.skip=true;}
 get shotInFlight(){return !!this.shot;}
 buildTracer(result){
  this.clearTracer();
  const air=result.path.slice(0,(result.landingPathIndex||0)+1);
  if(air.length<3)return;
  const curve=new THREE.CatmullRomCurve3(air.map(p=>new THREE.Vector3(p.x,p.y,p.z)));
  const segments=Math.min(160,air.length*2),radial=6;
  const geometry=new THREE.TubeGeometry(curve,segments,.13,radial,false);geometry.setDrawRange(0,0);
  this.tracerMaterial.opacity=.9;
  this.tracer=new THREE.Mesh(geometry,this.tracerMaterial);this.tracer.userData={segments,radial,count:air.length-1};this.tracer.renderOrder=2;this.scene.add(this.tracer);
 }
 revealTracer(fraction){
  if(!this.tracer)return;const {segments,radial}=this.tracer.userData;
  this.tracer.geometry.setDrawRange(0,Math.ceil(clamp(fraction,0,1)*segments)*radial*6);
 }
 clearTracer(){
  if(this.tracer){this.scene.remove(this.tracer);this.tracer.geometry.dispose();this.tracer=null;}
  if(this.landingRing){this.landingRing.visible=false;this.ringAge=0;}
 }
 celebrate(){this.celebration=2.6;}
 resize(){
  if(this.disposed)return;
  const rect=this.canvas.getBoundingClientRect();const width=Math.max(1,rect.width||this.canvas.clientWidth||window.innerWidth),height=Math.max(1,rect.height||this.canvas.clientHeight||window.innerHeight);
  this.width=width;this.height=height;
  const cap=this.quality==='low'?1:this.quality==='medium'?1.25:1.75;
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,cap));this.renderer.setSize(width,height,false);
  this.camera.aspect=width/height;this.camera.clearViewOffset();
  // Full-screen canvas is shared by the cream editor; keep the model in its left preview pane.
  if(this.mode==='avatar'&&width>760)this.camera.setViewOffset(width,height,width*.27,0,width,height);
  this.camera.updateProjectionMatrix();
 }
 update(dt){
  if(this.disposed||!this.hole)return;
  // Shots run on wall-clock time so a slow frame rate never stretches a shot; scenery keeps a small step.
  const realDt=clamp(Number(dt)||0,0,.5);
  dt=Math.min(realDt,.08);this.time+=dt;
  this.environment?.userData.animate?.(this.time,this.reducedMotion);
  this.celebration=Math.max(0,this.celebration-dt);
  let kind=this.mode==='play'?'address':'idle',animationTime=this.time;
  if(this.shot){
   const shot=this.shot;shot.elapsed+=realDt;
   const swingDuration=this.reducedMotion ? .45 : .92;
   kind='swing';animationTime=Math.min(1,shot.elapsed/swingDuration);
   if(shot.skip){shot.elapsed=Math.max(shot.elapsed,swingDuration*.52);shot.sim=shot.duration;shot.tail=1;}
   if(shot.elapsed>=swingDuration*.52){
    const path=shot.result.path;
    // Air time plays at a readable pace; rollout fast-forwards.
    if(shot.sim<shot.duration){const air=shot.sim<shot.landingT;shot.sim=Math.min(shot.duration,shot.sim+realDt*(this.reducedMotion?2.4:air?1.7:4));}
    else shot.tail+=realDt;
    const flightTime=shot.sim;
    while(shot.index<path.length-2&&path[shot.index+1].t<=flightTime)shot.index++;
    const a=path[shot.index],b=path[Math.min(path.length-1,shot.index+1)];
    const f=clamp((flightTime-a.t)/Math.max(.00001,b.t-a.t),0,1);
    this.ball.position.set(THREE.MathUtils.lerp(a.x,b.x,f),THREE.MathUtils.lerp(a.y,b.y,f),THREE.MathUtils.lerp(a.z,b.z,f));
    const distance=this.camera.position.distanceTo(this.ball.position);this.ball.scale.setScalar(clamp(distance/70,1,2.2));
    shot.followStarted=true;
    const landingIndex=shot.result.landingPathIndex||0;
    if(this.tracer)this.revealTracer(landingIndex?Math.min(1,(shot.index+f)/landingIndex):1);
    if(!shot.landed&&shot.landingT>0&&flightTime>=shot.landingT){
     shot.landed=true;const l=path[landingIndex]||a;
     this.landingRing.position.set(l.x,this.ground(l.x,l.z)+.08,l.z);this.landingRing.visible=true;this.ringAge=0;
    }
    if(shot.tail>=.35){
     this.shot=null;this.ball.scale.setScalar(1);this.setBall(shot.result.end);this.initialCamera=false;
     if(shot.result.holed)this.celebrate();
     shot.onComplete?.();
    }
   }
  }
  if(this.landingRing.visible){
   this.ringAge+=realDt;const k=this.ringAge/.9;
   this.landingRing.scale.setScalar(1+k*3.2);this.landingRing.material.opacity=Math.max(0,.85*(1-k));
   if(k>=1)this.landingRing.visible=false;
  }
  if(this.tracer&&!this.shot)this.tracerMaterial.opacity=Math.max(.35,this.tracerMaterial.opacity-realDt*.6);
  if(this.celebration>0){kind='celebration';animationTime=2.6-this.celebration;}
  if(this.avatar){this.avatar.visible=this.mode!=='menu';this.avatar.userData.animate(this.reducedMotion&&kind==='idle'?0:animationTime,kind);}
  this.updateCamera(dt);
  this.renderer.render(this.scene,this.camera);
 }
 updateCamera(dt){
  const b=this.ballPoint,h=this.ground(b.x,b.z),p=this.desiredPosition,l=this.desiredLookAt;
  this.ball.visible=this.mode==='play';
  if(this.mode==='avatar'){
   const origin=this.hole.tee,ground=this.ground(origin.x,origin.z);
   p.set(origin.x+.4,ground+2.8,origin.z-10.4);l.set(origin.x,ground+2.35,origin.z);this.camera.fov=36;
  }else if(this.mode==='menu'){
   const phase=this.reducedMotion?0:this.time*.012;
   p.set(65+Math.sin(phase)*9,49,-38+Math.cos(phase)*7);
   const target=this.hole.path[Math.min(2,this.hole.path.length-1)]||this.hole.pin;
   l.set(-35,10,Math.min(target.z,145));this.camera.fov=54;
  }else if(this.shot?.followStarted&&!this.reducedMotion){
   const ball=this.ball.position,angle=this.aim;
   p.set(ball.x-Math.sin(angle)*25,Math.max(ball.y+12,this.ground(ball.x,ball.z)+15),ball.z-Math.cos(angle)*25);
   l.set(ball.x,ball.y+1.7,ball.z+7);this.camera.fov=52;
  }else{
   const angle=this.aim+this.orbitYaw,dist=13.8+this.orbitPitch*8;
   p.set(b.x-Math.sin(angle)*dist,h+7.2+this.orbitPitch*14,b.z-Math.cos(angle)*dist);
   l.set(b.x+Math.sin(angle)*27,h-.8,b.z+Math.cos(angle)*27);this.camera.fov=52;
  }
  const factor=this.initialCamera?1:1-Math.exp(-dt*(this.shot?3.2:5));
  this.camera.position.lerp(p,factor);this.lookAt.lerp(l,factor);this.camera.lookAt(this.lookAt);this.camera.updateProjectionMatrix();this.initialCamera=false;
  // The shadow frustum follows the player / actual ball, avoiding a huge low-resolution map.
  const focus=this.mode==='avatar'?this.hole.tee:this.shot?this.ball.position:b;
  this.sun.target.position.set(focus.x,0,focus.z);this.sun.position.set(focus.x-65,110,focus.z-45);this.sun.target.updateMatrixWorld();
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.shot=null;this.resizeObserver?.disconnect();this.canvas.removeEventListener('webglcontextlost',this.contextLost);
  disposeObject(this.scene);this.renderer.dispose();
 }
}
