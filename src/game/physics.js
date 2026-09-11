import {distance,surfaceAt,terrainHeight} from './courses.js';
export const CLUBS=[
  {id:'driver',code:'1W',name:'Driver',range:215,angle:24},
  {id:'wood',code:'3W',name:'Fairway wood',range:180,angle:29},
  {id:'iron5',code:'5I',name:'5 iron',range:135,angle:37},
  {id:'iron7',code:'7I',name:'7 iron',range:105,angle:43},
  {id:'wedge',code:'PW',name:'Pitching wedge',range:65,angle:53},
  {id:'sand',code:'SW',name:'Sand wedge',range:35,angle:62},
  {id:'putter',code:'PT',name:'Putter',range:24,angle:0},
];
export const clampPower=v=>Math.max(0,Math.min(1.2,Number(v)||0));
export function simulateShot({hole,start,club=CLUBS[0],power=1,aim=0,accuracy=0}){
  power=clampPower(power);
  const startLie=surfaceAt(hole,start),isPutt=club.id==='putter';
  const lieFactor=startLie==='sand'?(club.id==='sand'?0.9:0.57):startLie==='rough'?0.82:1;
  const spread=0.009+Math.max(0,power-1)*0.20;
  aim+=Math.max(-1,Math.min(1,accuracy))*spread;
  const intendedRange=club.range*(power<=1?power**1.45:1+(power-1)*0.65)*lieFactor;
  const g=9.8,angle=club.angle*Math.PI/180,v=Math.sqrt(Math.max(0,intendedRange*g/Math.sin(2*angle)));
  let x=start.x,z=start.z,y=terrainHeight(hole,x,z)+0.22,t=0;
  let speed=isPutt?Math.sqrt(2*0.9*club.range)*power: v*Math.cos(angle);
  let vx=Math.sin(aim)*speed,vz=Math.cos(aim)*speed,vy=isPutt?0:v*Math.sin(angle);
  let airborne=!isPutt,landing={...start},landed=isPutt,landingPathIndex=0,holed=false,penalty=0,hazard=null,bounces=0;
  const path=[{x,y,z,t}];
  if(power===0)return {path,landing,landingPathIndex,stop:{...start},end:{...start},carry:0,total:0,penalty:0,hazard,holed:false,lie:startLie,spread:0};
  const dt=1/45;
  for(let i=0;i<1800;i++){
    t+=dt;const previous={x,z};
    if(airborne){vx+=hole.wind.x*0.095*dt;vz+=hole.wind.z*0.095*dt;vy-=g*dt;}
    else {
      const lie=surfaceAt(hole,{x,z}),friction=({green:0.9,fairway:1.45,tee:1.5,rough:3.8,sand:7}[lie]||2);
      const slopeX=(terrainHeight(hole,x+.3,z)-terrainHeight(hole,x-.3,z))/.6;
      const slopeZ=(terrainHeight(hole,x,z+.3)-terrainHeight(hole,x,z-.3))/.6;
      vx-=slopeX*g*dt;vz-=slopeZ*g*dt;
      speed=Math.hypot(vx,vz);const scale=Math.max(0,(speed-friction*dt)/(speed||1));vx*=scale;vz*=scale;
    }
    x+=vx*dt;z+=vz*dt;y+=vy*dt;
    const ground=terrainHeight(hole,x,z)+.22,lie=surfaceAt(hole,{x,z});
    if(y<=ground || !airborne){
      y=ground;
      if(!landed){landing={x,z};landed=true;landingPathIndex=path.length;path.push({x,y,z,t});}
      if(lie==='water'||lie==='out'){
        penalty=1;hazard={lie,point:{x,z}};
        if(path.at(-1).t!==t)path.push({x,y,z,t});
        break;
      }
      if(airborne && Math.abs(vy)>3 && bounces<2 && lie!=='sand'){
        const landingRetention=({green:.34,fairway:.4,tee:.4,rough:.28}[lie]||.32);
        vy=Math.abs(vy)*(lie==='rough'?.12:.23);vx*=landingRetention;vz*=landingRetention;bounces++;
      }else{airborne=false;vy=0;}
      // Forgiving capture catches a slow ball traversing the cup, not just one sample.
      if(!airborne && Math.hypot(vx,vz)<8){
        const dx=x-previous.x,dz=z-previous.z;
        const u=Math.max(0,Math.min(1,((hole.pin.x-previous.x)*dx+(hole.pin.z-previous.z)*dz)/(dx*dx+dz*dz||1)));
        if(Math.hypot(previous.x+u*dx-hole.pin.x,previous.z+u*dz-hole.pin.z)<1.55){
          x=hole.pin.x;z=hole.pin.z;holed=true;path.push({x,y:terrainHeight(hole,x,z),z,t});break;
        }
      }
      if(!airborne&&Math.hypot(vx,vz)<.07)break;
    }
    if(i%2===0&&path.at(-1).t!==t)path.push({x,y,z,t});
  }
  const stop={x,z},end=penalty?{...start}:{...stop};
  if(!penalty&&path.at(-1).t!==t)path.push({x,y,z,t});
  return {path,landing,landingPathIndex,stop,end,carry:isPutt?0:distance(start,landing),total:distance(start,stop),penalty,hazard,holed,lie:surfaceAt(hole,end),spread:spread*distance(start,stop)};
}
export function recommendedClub(hole,ball){
  const d=distance(ball,hole.pin);
  if(surfaceAt(hole,ball)==='green')return CLUBS.length-1;
  for(let i=CLUBS.length-2;i>=0;i--)if(CLUBS[i].range*1.12>=d)return i;
  return 0;
}
