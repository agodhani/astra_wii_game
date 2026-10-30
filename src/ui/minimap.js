import {surfaceAt,terrainHeight} from '../game/courses.js';
import {simulateShot} from '../game/physics.js';

const terrainRasters=new WeakMap();
const planar=p=>p?{x:p.x,z:p.z}:null;
const samePoint=(a,b)=>a&&b&&Math.hypot(a.x-b.x,a.z-b.z)<1e-6;

export function getMinimapShotGeometry(prediction,club){
 const sampled=(prediction.path||[]).map(planar),landing=planar(prediction.landing);
 const stop=planar(prediction.stop||prediction.end||landing);
 if(club.id==='putter')return {solidPath:sampled,rollPath:[],target:stop,stopPoint:stop,hazardPoint:prediction.penalty?planar(prediction.hazard?.point||stop):null,resetPoint:prediction.penalty?planar(prediction.end):null};
 let split=Number.isInteger(prediction.landingPathIndex)?prediction.landingPathIndex:-1;
 if(split<0||split>=sampled.length){
   let nearest=Infinity;
   for(let i=0;i<sampled.length;i++){const d=Math.hypot(sampled[i].x-landing.x,sampled[i].z-landing.z);if(d<nearest){nearest=d;split=i;}}
 }
 split=Math.max(0,split);
 const solidPath=sampled.slice(0,split+1),rollPath=sampled.slice(split);
 if(landing&&!samePoint(solidPath.at(-1),landing))solidPath.push(landing);
 if(landing&&!samePoint(rollPath[0],landing))rollPath.unshift(landing);
 if(stop&&!samePoint(rollPath.at(-1),stop))rollPath.push(stop);
 return {solidPath,rollPath,target:landing||stop,stopPoint:stop,hazardPoint:prediction.penalty?planar(prediction.hazard?.point||stop):null,resetPoint:prediction.penalty?planar(prediction.end):null};
}

// Within this range (or with the putter) the map zooms to the ball-to-pin area and reads the green.
export const GREEN_VIEW_RANGE=40;
export function minimapView(hole,ball,club,w=220,h=330){
 const margin=20,d=Math.hypot(ball.x-hole.pin.x,ball.z-hole.pin.z);
 if(club.id!=='putter'&&d>=GREEN_VIEW_RANGE){const scale=Math.min((w-2*margin)/170,(h-2*margin)/(hole.length+35));return {green:false,scale,cx:0,cz:(h/2-margin)/scale};}
 const scale=Math.min(w,h)/Math.max(hole.greenRadius*2.4,d*1.5+12);
 return {green:true,scale,cx:(ball.x+hole.pin.x)/2,cz:(ball.z+hole.pin.z)/2};
}

function terrainRaster(hole,w,h,view){
 const key=`${w}:${h}:${view.scale}:${view.cx}:${view.cz}`,slot=view.green?'green':'overview',cache=terrainRasters.get(hole)||{};terrainRasters.set(hole,cache);
 const cached=cache[slot];
 if(cached?.key===key)return cached.canvas;
 const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):document.createElement('canvas');
 canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d'),colors={out:'#72c1bd',water:'#87d5d3',rough:'#448260',fairway:'#91c477',green:'#bad688',sand:'#f4dfa6',tee:'#a6ce81'};
 ctx.fillStyle=colors.out;ctx.fillRect(0,0,w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const point={x:view.cx+(x-w/2)/view.scale,z:view.cz+(h/2-y)/view.scale},lie=surfaceAt(hole,point);
   ctx.fillStyle=lie==='fairway'&&Math.floor(point.z/16)%2?'#8abc70':colors[lie];ctx.fillRect(x,y,1,1);
 }
 cache[slot]={key,canvas};return canvas;
}

// Downhill arrows across the green plus 10 ft / 20 ft rings around the cup.
function drawGreenRead(ctx,hole,px,py,scale){
 const r=hole.greenRadius,step=r/3.2,e=.5;
 ctx.save();ctx.strokeStyle='rgba(255,255,255,.62)';ctx.fillStyle='rgba(255,255,255,.62)';ctx.lineWidth=1.4;
 for(let x=-r;x<=r;x+=step)for(let z=-r;z<=r;z+=step){
  if(Math.hypot(x,z)>r*.92)continue;
  const wx=hole.pin.x+x,wz=hole.pin.z+z;
  const gx=(terrainHeight(hole,wx+e,wz)-terrainHeight(hole,wx-e,wz))/(2*e),gz=(terrainHeight(hole,wx,wz+e)-terrainHeight(hole,wx,wz-e))/(2*e);
  const g=Math.hypot(gx,gz);if(g<1e-4)continue;
  const dx=-gx/g,dy=gz/g,cx=px(wx),cy=py(wz),len=Math.min(7,3+g*500);
  ctx.beginPath();ctx.moveTo(cx-dx*len,cy-dy*len);ctx.lineTo(cx+dx*len,cy+dy*len);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+dx*(len+2),cy+dy*(len+2));ctx.lineTo(cx+dx*len-dy*3,cy+dy*len+dx*3);ctx.lineTo(cx+dx*len+dy*3,cy+dy*len-dx*3);ctx.fill();
 }
 ctx.setLineDash([2,3]);ctx.strokeStyle='rgba(255,255,255,.75)';ctx.font='600 9px "DM Sans",sans-serif';ctx.fillStyle='#fff';ctx.textAlign='left';
 for(const ft of [10,20]){const rr=ft/3*scale;ctx.beginPath();ctx.arc(px(hole.pin.x),py(hole.pin.z),rr,0,Math.PI*2);ctx.stroke();ctx.fillText(`${ft} ft`,px(hole.pin.x)+rr*.72+2,py(hole.pin.z)+rr*.72+9);}
 ctx.restore();
}

export function drawMinimap(canvas,hole,ball,aim,club,power,prediction){
 const dpr=Math.min(globalThis.devicePixelRatio||1,2),w=220,h=330;
 if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr;}
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 const view=minimapView(hole,ball,club,w,h),scale=view.scale;
 const px=x=>w/2+(x-view.cx)*scale,py=z=>h/2-(z-view.cz)*scale;
 ctx.clearRect(0,0,w,h);ctx.drawImage(terrainRaster(hole,w,h,view),0,0,w,h);
 if(view.green)drawGreenRead(ctx,hole,px,py,scale);
 ctx.save();ctx.strokeStyle='rgba(255,255,255,.20)';ctx.lineWidth=1;
 for(const e of hole.ponds){ctx.beginPath();ctx.ellipse(px(e.x),py(e.z),e.rx*scale,e.rz*scale,0,0,Math.PI*2);ctx.stroke();}ctx.restore();
 const line=pts=>{if(pts.length<2)return;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(px(p.x),py(p.z)):ctx.moveTo(px(p.x),py(p.z)));ctx.stroke();};
 const geometry=getMinimapShotGeometry(prediction,club),target=geometry.target;
 ctx.strokeStyle='#2cafe7';ctx.lineWidth=4;line(geometry.solidPath);
 ctx.setLineDash([3,4]);ctx.strokeStyle='#fff6d7';ctx.lineWidth=2;line(geometry.rollPath);ctx.setLineDash([]);
 for(const p of [.25,.5,.75,1]){const r=simulateShot({hole,start:ball,club,power:p,aim});const pt=club.id==='putter'?r.stop:r.landing;ctx.beginPath();ctx.arc(px(pt.x),py(pt.z),2.6,0,Math.PI*2);ctx.fillStyle='#fff8e8';ctx.fill();}
 if(prediction.spread>0.3){ctx.beginPath();ctx.ellipse(px(target.x),py(target.z),Math.max(3,prediction.spread*scale),Math.max(4,prediction.spread*scale*.6),0,0,Math.PI*2);ctx.fillStyle='rgba(255,209,110,.25)';ctx.fill();}
 ctx.save();ctx.translate(px(target.x),py(target.z));ctx.rotate(Math.PI/4);ctx.fillStyle='#f9cd6a';ctx.strokeStyle='#fff';ctx.lineWidth=1.7;ctx.fillRect(-4,-4,8,8);ctx.strokeRect(-4,-4,8,8);ctx.restore();
 if(geometry.stopPoint&&!samePoint(geometry.stopPoint,target)){
   ctx.beginPath();ctx.arc(px(geometry.stopPoint.x),py(geometry.stopPoint.z),4,0,Math.PI*2);ctx.fillStyle='#2cafe7';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
 }
 if(geometry.hazardPoint){
   const x=px(geometry.hazardPoint.x),y=py(geometry.hazardPoint.z);ctx.strokeStyle='#ef725d';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.moveTo(x-4,y-4);ctx.lineTo(x+4,y+4);ctx.moveTo(x+4,y-4);ctx.lineTo(x-4,y+4);ctx.stroke();
 }
 if(geometry.resetPoint){
   ctx.beginPath();ctx.arc(px(geometry.resetPoint.x),py(geometry.resetPoint.z),5,0,Math.PI*2);ctx.fillStyle='#42c5ee';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
 }
 ctx.save();ctx.translate(px(ball.x),py(ball.z));ctx.rotate(aim);ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(6,6);ctx.lineTo(0,3);ctx.lineTo(-6,6);ctx.closePath();ctx.fillStyle='#42c5ee';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.restore();
 ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(hole.pin.x),py(hole.pin.z));ctx.lineTo(px(hole.pin.x),py(hole.pin.z)-18);ctx.stroke();ctx.fillStyle='#e87b62';ctx.beginPath();ctx.moveTo(px(hole.pin.x),py(hole.pin.z)-18);ctx.lineTo(px(hole.pin.x)+12,py(hole.pin.z)-14);ctx.lineTo(px(hole.pin.x),py(hole.pin.z)-10);ctx.fill();
 return view;
}
