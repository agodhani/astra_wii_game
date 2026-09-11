import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0,1,0);
const color = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;

/** Original modular adult athlete. Local +Z is the face / address direction. */
export function createAvatar(profile = {}) {
  const root = new THREE.Group(); root.name = `golfer-${profile.name || 'player'}`;
  const materials = {};
  const mat = (name, c, roughness=.75) => materials[name] ||= new THREE.MeshStandardMaterial({color:c,roughness});
  const skin=mat('skin',color(profile.skin,'#af7551'));
  const hair=mat('hair',color(profile.hair,'#2c211d'));
  const top=mat('top',color(profile.top,'#148899'));
  const bottom=mat('bottom',color(profile.bottom,'#243c54'));
  const white=mat('white','#fff8e8'); const navy=mat('navy','#20334a');
  const sole=mat('sole','#dbe2df'); const black=mat('black','#17222b');
  const iris=mat('iris','#5b3f25'); const mouth=mat('mouth','#8d4137');
  const highlight=mat('highlight','#eadfc7');
  const width=profile.build==='strong'?1.15:profile.build==='slim'?.87:1;
  const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{
    const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const ellipsoid=(parent,material,x,y,z,sx,sy,sz)=>{
    const m=mesh(parent,new THREE.SphereGeometry(1,20,16),material,x,y,z);m.scale.set(sx,sy,sz);return m;
  };
  const segment=(parent,material,a,b,r1,r2=r1)=>{
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);
    const m=mesh(parent,new THREE.CylinderGeometry(r2,r1,d.length(),14),material);
    m.position.copy(av.add(bv).multiplyScalar(.5));m.quaternion.setFromUnitVectors(UP,d.normalize());return m;
  };
  const body=new THREE.Group();body.name='body';root.add(body);
  const legs=[];
  for(const side of [-1,1]) {
    const x=side*.29*width;
    const leg=new THREE.Group();leg.position.set(x,2.06,0);body.add(leg);legs.push(leg);
    const trousers=profile.outfit==='trousers';
    segment(leg,bottom,[0,0,0],[side*.07,-.89,.045],.225*width,.19*width);
    segment(leg,trousers?bottom:skin,[side*.07,-.89,.045],[side*.09,-1.78,0],.18*width,.12*width);
    ellipsoid(leg,trousers?bottom:skin,side*.07,-.89,.045,.185*width,.18,.181);
    if(!trousers)segment(leg,white,[side*.09,-1.68,0],[side*.09,-1.83,0],.13,.13);
    ellipsoid(leg,white,side*.09,-1.9,.14,.205,.16,.37);
    ellipsoid(leg,sole,side*.09,-2.015,.14,.207,.055,.37);
    ellipsoid(leg,navy,side*.09+side*.178,-1.87,.07,.026,.048,.2);
    for(let i=0;i<3;i++)segment(leg,highlight,[-.12+side*.09,-1.78,.19+i*.055],[.12+side*.09,-1.78,.19+i*.055],.009);
  }
  if(profile.outfit==='skort') {
    const skirt=mesh(body,new THREE.CylinderGeometry(.50*width,.66*width,.69,24),bottom,0,1.88,0);skirt.scale.z=.73;
    for(const x of [-.32,0,.32])segment(body,navy,[x*width,1.56,.43],[x*.78*width,2.19,.34],.007);
  }
  ellipsoid(body,bottom,0,2.065,0,.47*width,.26,.32);
  const belt=mesh(body,new THREE.CylinderGeometry(.48*width,.49*width,.105,24),navy,0,2.21,0);belt.scale.z=.66;
  mesh(body,new THREE.BoxGeometry(.115,.092,.025),highlight,0,2.21,.333);
  const shoulders=new THREE.Group();shoulders.name='shoulders';shoulders.position.y=2.24;body.add(shoulders);
  const torso=mesh(shoulders,new THREE.CylinderGeometry(.60*width,.47*width,1.07,24),top,0,.55,0);torso.scale.z=.63;

  segment(shoulders,skin,[0,1.05,0],[0,1.34,0],.18,.17);
  for(const side of [-1,1]){
    const collar=mesh(shoulders,new THREE.BoxGeometry(.22,.21,.07),top,side*.17,1.10,.235);collar.rotation.z=side*.39;collar.rotation.x=-.35;
    segment(shoulders,white,[side*.06,1.10,.283],[side*.22,.96,.31],.012);
  }
  segment(shoulders,navy,[0,1.05,.343],[0,.72,.365],.016);
  for(let i=0;i<3;i++)ellipsoid(shoulders,white,0,.98-i*.1,.375,.016,.016,.014);
  // Small embroidered bay mark, with no borrowed logos.
  mesh(shoulders,new THREE.BoxGeometry(.12,.025,.025),white,-.28*width,.85,.34).rotation.z=.3;
  const arms=[];
  for(const side of [-1,1]) {
    const arm=new THREE.Group();arm.position.set(side*.55*width,.94,0);arm.name=side<0?'left-arm':'right-arm';shoulders.add(arm);arms.push(arm);
    ellipsoid(arm,top,0,-.08,0,.20*width,.225,.212);
    segment(arm,top,[0,-.1,0],[side*.075,-.41,.02],.21*width,.17*width);
    segment(arm,white,[side*.06,-.38,.015],[side*.075,-.415,.02],.196*width,.196*width);
    segment(arm,skin,[side*.075,-.42,.02],[side*.10,-.76,.07],.148*width,.12*width);
    const forearm=new THREE.Group();forearm.position.set(side*.10,-.76,.07);arm.add(forearm);arm.userData.forearm=forearm;
    ellipsoid(forearm,skin,0,0,0,.122,.125,.12);
    segment(forearm,skin,[0,0,0],[0,-.55,.025],.12*width,.08*width);
    ellipsoid(forearm,side<0?white:skin,0,-.63,.025,.105,.15,.09);
    ellipsoid(forearm,side<0?white:skin,-side*.085,-.59,.075,.045,.08,.045);
  }
  const head=new THREE.Group();head.position.set(0,1.61,.015);head.name='head';head.scale.setScalar(.86);shoulders.add(head);
  const sharp=profile.face==='sharp';
  ellipsoid(head,skin,0,.08,0,sharp?.365:.395,.49,.35);
  ellipsoid(head,skin,0,-.17,.08,sharp?.285:.325,.25,.285);
  for(const side of [-1,1]) {
    ellipsoid(head,skin,side*.365,.04,.005,.085,.145,.08);
    ellipsoid(head,mouth,side*.399,.04,.029,.022,.074,.045);
    const eyeX=side*.153;
    ellipsoid(head,white,eyeX,.135,.310,.091,sharp?.052:.063,.033);
    ellipsoid(head,iris,eyeX,.133,.349,.043,.048,.019);
    ellipsoid(head,black,eyeX,.133,.365,.022,.030,.009);
    ellipsoid(head,white,eyeX-.012,.15,.375,.013,.015,.008);
    const brow=ellipsoid(head,hair,eyeX,.245,.306,.112,.027,.034);brow.rotation.z=side*(sharp?.16:-.06);

  }
  ellipsoid(head,skin,0,.035,.34,.072,.12,.092);
  ellipsoid(head,skin,0,-.024,.381,.083,.046,.059);
  const smile=new THREE.EllipseCurve(0,-.09,.125,.06,Math.PI*1.12,Math.PI*1.87,false,0);
  const smilePoints=smile.getPoints(14).map(p=>new THREE.Vector3(p.x,p.y-.035,.359));
  mesh(head,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smilePoints),14,.014,6,false),mouth);
  ellipsoid(head,skin,0,-.25,.21,.15,.09,.096);
  // A sculpted hair cap with individual locks; each style changes the silhouette.
  const style=profile.hairStyle||'crop';
  const cap=mesh(head,new THREE.SphereGeometry(1,24,16,0,Math.PI*2,0,Math.PI*.39),hair,0,.15,-.045);cap.scale.set(.402,.46,.363);
  for(let i=0;i<11;i++){
    const angle=i*2.39996;
    const lock=ellipsoid(head,hair,Math.cos(angle)*.25,.49+Math.sin(i*1.8)*.04,Math.sin(angle)*.22,.13,.10,.18);lock.rotation.z=Math.sin(angle)*.4;
  }
  if(style==='curls'||style==='twists') {
    for(let i=0;i<42;i++){
      const a=i*2.39996,r=.34*Math.sqrt((i+.5)/42),x=Math.cos(a)*r,z=Math.sin(a)*r;
      const y=.37+Math.sqrt(Math.max(0,.15-r*r))*.50;
      const lock=ellipsoid(head,hair,x,y,z,style==='twists'?.052:.09,style==='twists'?.16:.09,.075);
      lock.rotation.z=Math.sin(a)*.5;
    }
    if(style==='curls')for(let i=0;i<15;i++)ellipsoid(head,hair,Math.sin(i*2.4)*.23,.12+Math.cos(i*1.7)*.23,-.42,.13,.13,.13);
  }
  if(style==='ponytail') {
    ellipsoid(head,navy,0,.25,-.34,.13,.12,.08);
    for(let i=0;i<6;i++)ellipsoid(head,hair,.05*Math.sin(i),.23-i*.105,-.41-i*.035,.13-i*.01,.16,.14);
    const sweep=ellipsoid(head,hair,-.16,.41,.21,.25,.13,.14);sweep.rotation.z=-.25;
  }
  if(style==='bob') for(const side of [-1,1]){
    ellipsoid(head,hair,side*.34,.03,-.055,.13,.39,.26);
    ellipsoid(head,hair,side*.28,-.22,-.12,.17,.15,.23);
  }
  if(style==='undercut') for(let i=0;i<5;i++){
    const m=ellipsoid(head,hair,-.15+i*.07,.53+i*.012,.16,.14,.13,.20);m.rotation.z=-.55;
  }
  if(profile.hat==='cap'||profile.hat==='visor') {
    if(profile.hat==='cap') {
      const hat=mesh(head,new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI/2),white,0,.30,0);hat.scale.set(.435,.39,.40);
      ellipsoid(head,navy,0,.69,0,.045,.027,.045);
    }
    const band=mesh(head,new THREE.CylinderGeometry(.428,.426,.095,32,1,true),navy,0,.33,0);band.scale.z=.94;
    ellipsoid(head,white,0,.30,.42,.40,.034,.27);
    mesh(head,new THREE.BoxGeometry(.10,.08,.025),top,0,.47,.383).rotation.z=.2;
  }
  if(profile.accessory==='glasses') for(const side of [-1,1]){
    const rim=mesh(head,new THREE.TorusGeometry(.103,.014,7,20),navy,side*.155,.135,.37);rim.scale.y=.76;
    segment(head,navy,[side*.24,.15,.35],[side*.39,.17,.02],.012);
    segment(head,navy,[-.05,.15,.38],[.05,.15,.38],.012);
  }
  if(profile.accessory==='earrings')for(const side of [-1,1])mesh(head,new THREE.TorusGeometry(.063,.012,7,16),mat('gold','#e8b352'),side*.397,-.08,.04);
  if(profile.accessory==='beard'){
    const beard=mesh(head,new THREE.SphereGeometry(1,20,10,0,Math.PI*2,Math.PI*.48,Math.PI*.52),hair,0,-.04,.01);beard.scale.set(.32,.28,.305);
    for(const side of [-1,1])ellipsoid(head,hair,side*.074,-.092,.339,.080,.028,.025);
  }
  const club=new THREE.Group();club.name='club';shoulders.add(club);
  segment(club,black,[0,0,0],[0,-.35,.3],.035);
  segment(club,mat('shaft','#b9c8cc',.28),[0,-.35,.3],[0,-1.83,1.78],.018);
  ellipsoid(club,navy,0,-1.88,1.85,.15,.10,.23);
  const neutral={bodyY:0};
  root.userData.profile={...profile};
  root.userData.animate=(t=0,kind='idle')=>{
    body.position.y=neutral.bodyY;
    body.rotation.set(0,0,0);shoulders.rotation.set(0,0,0);head.rotation.set(0,0,0);
    for(let i=0;i<2;i++){arms[i].rotation.set(0,0,(i===0?1:-1)*.10);arms[i].userData.forearm.rotation.set(-.10,0,0);legs[i].rotation.set(0,0,0);}
    club.visible=kind!=='celebration';club.scale.setScalar(.8);club.position.set(.60,-.05,.3);club.rotation.set(.68,0,.1);
    if(kind==='address'||kind==='swing'){
      shoulders.rotation.x=.29;head.rotation.x=.23;
      arms[0].rotation.set(-.70,0,.43);arms[1].rotation.set(-.68,0,-.40);
      for(const arm of arms)arm.userData.forearm.rotation.x=-.18;
      club.scale.setScalar(1);club.position.set(0,.1,.77);club.rotation.set(-.18,0,0);
      if(kind==='swing') {
        const p=Math.max(0,Math.min(1,t));
        const turn=p<.48?-Math.sin(p/.48*Math.PI/2)*1.15:-1.15+2.85*Math.sin((p-.48)/.52*Math.PI/2);
        shoulders.rotation.y=turn;body.rotation.y=turn*.18;
        const lift=p<.48?Math.sin(p/.48*Math.PI/2):Math.sin((p-.48)/.52*Math.PI/2);
        for(const arm of arms)arm.rotation.x=-.6-lift*1.1;
        club.rotation.x=-lift*1.9;club.position.y+=lift*.8;
        legs[1].rotation.x=Math.max(0,turn)*.08;
      }
    }else if(kind==='celebration'){
      body.position.y=Math.abs(Math.sin(t*Math.PI*3))*.27;
      arms[0].rotation.z=-2.3;arms[1].rotation.z=2.3;head.rotation.z=Math.sin(t*6)*.08;
    }else{
      shoulders.rotation.y=Math.sin(t*.75)*.025;
      shoulders.position.y=2.24+Math.sin(t*1.6)*.008;
      arms[0].rotation.z=.10;arms[1].rotation.z=-.16;head.rotation.y=Math.sin(t*.45)*.06;
    }
  };
  // Bake immutable pieces within each articulated joint. Hair and facial details
  // stay sculpted geometry while sharing a draw call per material.
  function bakeJoint(parent) {
    for(const child of [...parent.children])if(child.isGroup)bakeJoint(child);
    const byMaterial=new Map();
    for(const child of [...parent.children])if(child.isMesh){
      child.updateMatrix();const geometry=child.geometry.clone().applyMatrix4(child.matrix);
      if(!byMaterial.has(child.material))byMaterial.set(child.material,[]);
      byMaterial.get(child.material).push(geometry);child.geometry.dispose();parent.remove(child);
    }
    for(const [material,geometries] of byMaterial){
      const combined=mergeGeometries(geometries,false);
      const mesh=new THREE.Mesh(combined,material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
      for(const geometry of geometries)geometry.dispose();
    }
  }
  bakeJoint(root);
  root.userData.animate(0,'idle');
  return root;
}
