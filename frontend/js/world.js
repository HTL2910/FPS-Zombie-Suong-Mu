"use strict";
var ARENA=72;
var scene,camera,renderer,clock;
var flashlight,flashTarget,moonLight,streetLights=[];
var colliders=[];
var gunGroup,muzzleLight,gunScene,gunCam,gunMuzzle;
var ENV_T={},ENV_DIM={},ZB_T={},GUN_T={};
var HIT_FLASH_MAT=new THREE.MeshBasicMaterial({color:0xff3b30});

scene=new THREE.Scene();
scene.background=new THREE.Color(0x070a0f);
scene.fog=new THREE.FogExp2(0x0a0e13,0.029);
camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,0.1,200);
camera.position.set(0,1.7,40);

renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(1);
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=false;
document.getElementById('game').appendChild(renderer.domElement);
clock=new THREE.Clock();

// Fast 3-light world rig + player flashlight (no per-lamp PointLights!)
scene.add(new THREE.AmbientLight(0x8a97ad,0.9));
scene.add(new THREE.HemisphereLight(0x5a6c8c,0x1a1c14,0.95));
moonLight=new THREE.DirectionalLight(0xa9c0e0,1.15);moonLight.position.set(-30,50,-20);scene.add(moonLight);

var moon=new THREE.Mesh(new THREE.SphereGeometry(3.4,12,12),new THREE.MeshBasicMaterial({color:0xdfe8f5,fog:false}));
moon.position.set(-55,62,-70);scene.add(moon);
var moonGlow=new THREE.Mesh(new THREE.SphereGeometry(5.2,12,12),new THREE.MeshBasicMaterial({color:0x5a6d8f,transparent:true,opacity:0.25,fog:false}));
moonGlow.position.copy(moon.position);scene.add(moonGlow);

// Ground
var gCanvas=document.createElement('canvas');gCanvas.width=gCanvas.height=256;var gx=gCanvas.getContext('2d');
gx.fillStyle='#333830';gx.fillRect(0,0,256,256);
for(var i=0;i<2200;i++){gx.fillStyle=['#2a2e26','#3d4236','#31352c','#464c3c'][i%4];gx.fillRect(Math.random()*256,Math.random()*256,3,3);}
for(var i=0;i<110;i++){gx.fillStyle='#525c42';gx.fillRect(Math.random()*256,Math.random()*256,2,7);}
var gTex=new THREE.CanvasTexture(gCanvas);gTex.wrapS=gTex.wrapT=THREE.RepeatWrapping;gTex.repeat.set(22,22);
var ground=new THREE.Mesh(new THREE.PlaneGeometry(175,175),new THREE.MeshLambertMaterial({map:gTex,color:0xc2c7b2}));
ground.rotation.x=-Math.PI/2;scene.add(ground);

var pathMat=new THREE.MeshLambertMaterial({color:0x3a342a});
var p1=new THREE.Mesh(new THREE.PlaneGeometry(5,150),pathMat);p1.rotation.x=-Math.PI/2;p1.position.y=0.01;scene.add(p1);
var p2=new THREE.Mesh(new THREE.PlaneGeometry(150,5),pathMat);p2.rotation.x=-Math.PI/2;p2.position.y=0.011;scene.add(p2);

var wallMat=new THREE.MeshLambertMaterial({color:0x4a463e});
var roofMat=new THREE.MeshLambertMaterial({color:0x2c2622});
var woodMat=new THREE.MeshLambertMaterial({color:0x3d3226});
var stoneMat=new THREE.MeshLambertMaterial({color:0x5b5d58});
var darkStone=new THREE.MeshLambertMaterial({color:0x43453f});

function addBox(x,z,w,h,d,mat,y){var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,(y!==undefined?y:h/2),z);scene.add(m);return m;}
function addColliderBox(x,z,hw,hd){colliders.push({box:true,x:x,z:z,hw:hw,hd:hd});}
function addColliderCircle(x,z,r){colliders.push({box:false,x:x,z:z,r:r});}

function tree(x,z,s){var g=new THREE.Group();var trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.22*s,0.42*s,3.4*s,6),woodMat);trunk.position.y=1.7*s;g.add(trunk);
for(var b=0;b<4;b++){var br=new THREE.Mesh(new THREE.CylinderGeometry(0.05*s,0.13*s,1.9*s,5),woodMat);br.position.set(Math.cos(b*1.7)*0.6*s,(3+(b%2)*0.5)*s,Math.sin(b*1.7)*0.6*s);br.rotation.z=Math.cos(b*1.7)*0.8;br.rotation.x=-Math.sin(b*1.7)*0.8;g.add(br);}
g.position.set(x,0,z);scene.add(g);addColliderCircle(x,z,0.55*s);}

function house(x,z,rot){var g=new THREE.Group();var body=new THREE.Mesh(new THREE.BoxGeometry(8,4.4,6.5),wallMat);body.position.y=2.2;g.add(body);
var roof=new THREE.Mesh(new THREE.ConeGeometry(6.4,2.6,4),roofMat);roof.position.y=5.7;roof.rotation.y=Math.PI/4;g.add(roof);
g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);addColliderBox(x,z,4.4,3.7);}

var fenceMat=new THREE.MeshLambertMaterial({color:0x39312a});
function fenceRun(x,z,len,rot,sp){var g=new THREE.Group();var _sp=sp||1.6;var n=Math.floor(len/_sp);for(var k=0;k<n;k++){var post=new THREE.Mesh(new THREE.BoxGeometry(0.16,1.25,0.16),fenceMat);post.position.set(-len/2+k*_sp+0.8,0.62,0);g.add(post);}var rail=new THREE.Mesh(new THREE.BoxGeometry(len,0.12,0.07),fenceMat);rail.position.y=0.95;g.add(rail);var rail2=rail.clone();rail2.position.y=0.45;g.add(rail2);g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);}

// Base structural landmarks
(function buildLandmarks(){
  fenceRun(0,-ARENA-1.5,150,0,3.2);fenceRun(0,ARENA+1.5,150,0,3.2);fenceRun(-ARENA-1.5,0,150,Math.PI/2,3.2);fenceRun(ARENA+1.5,0,150,Math.PI/2,3.2);
  fenceRun(-13,-41.5,14,0);fenceRun(13,-41.5,14,0);
  fenceRun(-16,33,12,0.15);fenceRun(16,33,12,-0.1);
  // Ruined church tower & cross (North boss landmark)
  var g=new THREE.Group();
  var b=new THREE.Mesh(new THREE.BoxGeometry(11,7.5,17),darkStone);b.position.y=3.75;g.add(b);
  var roof=new THREE.Mesh(new THREE.ConeGeometry(8.6,3.8,4),roofMat);roof.position.y=9.4;roof.rotation.y=Math.PI/4;roof.scale.set(1,1,1.55);g.add(roof);
  var tower=new THREE.Mesh(new THREE.BoxGeometry(3.6,13,3.6),darkStone);tower.position.set(0,6.5,8.5);g.add(tower);
  var c1=new THREE.Mesh(new THREE.BoxGeometry(0.32,2.8,0.32),new THREE.MeshBasicMaterial({color:0xffdf8a}));c1.position.set(0,16.5,8.5);g.add(c1);
  var c2=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.32,0.32),new THREE.MeshBasicMaterial({color:0xffdf8a}));c2.position.set(0,16.9,8.5);g.add(c2);
  g.position.set(0,0,-54);scene.add(g);addColliderBox(0,-54,5.9,9);addColliderBox(0,-45.5,2.1,2.1);
  house(-18,42,0.9);tree(12,44,1.25);tree(-14,50,1.1);
})();

// Lamp poles with radial halo sprites (zero PointLights for 60 FPS!)
var lampGlowTex=(function(){var c=document.createElement('canvas');c.width=c.height=64;var g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,220,160,1)');gr.addColorStop(0.35,'rgba(255,175,90,0.45)');gr.addColorStop(1,'rgba(255,150,60,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);var t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;})();
var lampHeadMat=new THREE.MeshBasicMaterial({color:0xffc37a});
var lampHaloMat=new THREE.MeshBasicMaterial({map:lampGlowTex,color:0xffb45e,transparent:true,opacity:0.75,depthWrite:false,blending:THREE.AdditiveBlending});
function lamp(x,z){
  var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,4.4,6),new THREE.MeshLambertMaterial({color:0x22241f}));
  pole.position.set(x,2.2,z);scene.add(pole);
  var head=new THREE.Mesh(new THREE.SphereGeometry(0.24,8,8),lampHeadMat);
  head.position.set(x,4.5,z);scene.add(head);
  var hm=new THREE.Mesh(new THREE.PlaneGeometry(2.6,2.6),lampHaloMat);
  hm.position.set(x,4.5,z);scene.add(hm);
  streetLights.push({head:head,halo:hm,x:x,z:z,flick:Math.random()*10,on:true});
  addColliderCircle(x,z,0.3);
}
lamp(-6,-6);lamp(7,13);lamp(-18,24);lamp(18,-26);lamp(26,6);lamp(3.2,30);lamp(-3.2,-32);lamp(44,-10);lamp(-6,-40);

var wisps=[],wispMat=new THREE.MeshBasicMaterial({color:0x9fb2c8,transparent:true,opacity:0.036,depthWrite:false});
for(var i=0;i<10;i++){var wp=new THREE.Mesh(new THREE.PlaneGeometry(16+Math.random()*10,4),wispMat);wp.position.set(Math.random()*80-40,1.2+Math.random()*1.2,Math.random()*80-40);wp.rotation.y=Math.random()*Math.PI;scene.add(wp);wisps.push({m:wp,s:0.25+Math.random()*0.4});}

function makePoints(n,size,color,op){var geo=new THREE.BufferGeometry(),arr=new Float32Array(n*3);for(var i=0;i<n;i++){arr[i*3]=(Math.random()-0.5)*76;arr[i*3+1]=0.5+Math.random()*11;arr[i*3+2]=(Math.random()-0.5)*76;}geo.setAttribute('position',new THREE.BufferAttribute(arr,3));var p=new THREE.Points(geo,new THREE.PointsMaterial({color:color,size:size,transparent:true,opacity:op,depthWrite:false}));scene.add(p);return p;}
var dustPts=makePoints(120,0.05,0xfff2cf,0.45);
var rainPts=makePoints(280,0.08,0x9fc0e0,0.3);
var crows=[];

// Freeze static matrices built above
scene.traverse(function(o){if(o!==scene){o.matrixAutoUpdate=false;o.updateMatrix();}});
camera.matrixAutoUpdate=true;
wisps.forEach(function(w){w.m.matrixAutoUpdate=true;});
dustPts.matrixAutoUpdate=true;
rainPts.matrixAutoUpdate=true;
streetLights.forEach(function(sl){if(sl.halo)sl.halo.matrixAutoUpdate=true;});

// Flashlight
flashlight=new THREE.SpotLight(0xfff2cf,58,54,0.48,0.45,1.1);
camera.add(flashlight);flashlight.position.set(0.25,-0.22,0.1);
flashTarget=new THREE.Object3D();flashTarget.position.set(0,0,-10);camera.add(flashTarget);flashlight.target=flashTarget;scene.add(camera);
var fill=new THREE.PointLight(0xbfd0e8,2.8,9,1.2);camera.add(fill);fill.position.set(0,0,0.3);

// Viewmodel Scene
gunScene=new THREE.Scene();
gunCam=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,0.05,12);
gunScene.add(new THREE.HemisphereLight(0x9fb3d4,0x2a2620,1.1));
var _gunKey=new THREE.DirectionalLight(0xfff1d6,1.6);_gunKey.position.set(0.7,1.3,0.5);gunScene.add(_gunKey);
gunMuzzle=new THREE.PointLight(0xffc46b,0,6,1.2);gunMuzzle.position.set(0.3,-0.2,-1.0);gunScene.add(gunMuzzle);
gunGroup=new THREE.Group();gunScene.add(gunGroup);gunGroup.position.set(0.34,-0.34,-0.62);
muzzleLight=new THREE.PointLight(0xffc46b,0,10,1.2);muzzleLight.position.set(0.3,-0.25,-1.1);camera.add(muzzleLight);

// Fast Material Hardening: Convert MeshStandardMaterial -> MeshLambertMaterial ONCE on load
function toFastLambert(root,fallbackHex,tintMul){
  if(!root||!root.traverse)return;
  root.traverse(function(o){
    if(!(o.isMesh||o.isSkinnedMesh)||!o.material)return;
    var list=Array.isArray(o.material)?o.material:[o.material];
    var out=[];
    for(var i=0;i<list.length;i++){
      var m=list[i];
      if(!m){out.push(m);continue;}
      if(m.map){try{m.map.needsUpdate=true;}catch(e){}}
      var colHex=m.map?0xffffff:fallbackHex;
      var lm=new THREE.MeshLambertMaterial({
        map:m.map||null,
        color:colHex,
        transparent:false
      });
      if(tintMul&&lm.color)lm.color.multiplyScalar(tintMul);
      out.push(lm);
    }
    o.material=Array.isArray(o.material)?out:out[0];
    o.userData.origMat=o.material;
    o.frustumCulled=false;
  });
}
function hardenGunObj(root){
  if(!root||!root.traverse)return;
  root.traverse(function(o){
    if(!(o.isMesh||o.isSkinnedMesh)||!o.material)return;
    var list=Array.isArray(o.material)?o.material:[o.material];
    for(var i=0;i<list.length;i++){
      var m=list[i];if(!m)continue;
      if(m.map){try{m.map.needsUpdate=true;}catch(e){}}
      else if(m.color){try{m.color.setHex(0x23262b);}catch(e){}}
      if(typeof m.envMapIntensity==='number')m.envMapIntensity=0.5;
    }
  });
}

function _texCheck(root){
  var detail=null,ok=false;
  if(!root||!root.traverse)return {hasMap:false,imageLoaded:false,ok:false,w:0,h:0};
  root.traverse(function(o){
    if(!(o.isMesh||o.isSkinnedMesh)||!o.material)return;
    var list=Array.isArray(o.material)?o.material:[o.material];
    for(var i=0;i<list.length;i++){
      var m=list[i];if(!m)continue;
      if(m.map){
        var img=m.map.image;
        var loaded=!!(img&&((img.width||0)>0||(img.height||0)>0||img.complete===true));
        if(!detail)detail={hasMap:true,imageLoaded:loaded,w:img?(img.width||0):0,h:img?(img.height||0):0};
        if(loaded){ok=true;detail.imageLoaded=true;detail.w=img.width||detail.w;detail.h=img.height||detail.h;}
      }
    }
  });
  if(!detail)detail={hasMap:false,imageLoaded:false,w:0,h:0};
  detail.ok=ok;return detail;
}

window.__gunTexOk=function(){
  var out={};
  ['pistol','shotgun','rifle','thuanthien'].forEach(function(k){out[k]=_texCheck(GUN_T[k]).ok;});
  var zt=ZB_T.zombie||ZB_T.orcking;var zc=_texCheck(zt&&zt.scene);out.zombie=zc.ok;
  out.detail={pistol:_texCheck(GUN_T.pistol),shotgun:_texCheck(GUN_T.shotgun),rifle:_texCheck(GUN_T.rifle),thuanthien:_texCheck(GUN_T.thuanthien),zombie:zc,currentViewmodel:_texCheck(gunGroup),currentWeapon:(typeof curWeapon!=='undefined'?curWeapon:null)};
  return out;
};
window.__zbTexOk=function(){
  var out={loaded:Object.keys(ZB_T).length,detail:{}};
  ['zombie','ghost','skeleton','golem','orcking','troll','minotaur'].forEach(function(k){var c=_texCheck(ZB_T[k]&&ZB_T[k].scene);out[k]=c.ok;out.detail[k]=c;});
  return out;
};

// Spatial-filtered collision check (skips colliders >8m away)
function collide(pos,r){
  for(var i=0;i<colliders.length;i++){
    var c=colliders[i];
    if(Math.abs(c.x-pos.x)>8||Math.abs(c.z-pos.z)>8)continue;
    if(c.box){
      var cx=Math.max(c.x-c.hw,Math.min(c.x+c.hw,pos.x)),cz=Math.max(c.z-c.hd,Math.min(c.z+c.hd,pos.z));
      var dx=pos.x-cx,dz=pos.z-cz,d2=dx*dx+dz*dz;
      if(d2<r*r){
        if(d2>0.000001){var d=Math.sqrt(d2);pos.x=cx+dx/d*r;pos.z=cz+dz/d*r;}
        else{var pl=(c.hw+r)-Math.abs(pos.x-c.x),pr=(c.hd+r)-Math.abs(pos.z-c.z);if(pl<pr)pos.x=c.x+(pos.x>c.x?c.hw+r:-(c.hw+r));else pos.z=c.z+(pos.z>c.z?c.hd+r:-(c.hd+r));}
      }
    }else{
      var ddx=pos.x-c.x,ddz=pos.z-c.z,dd=Math.hypot(ddx,ddz),min=c.r+r;
      if(dd<min&&dd>0.001){pos.x=c.x+ddx/dd*min;pos.z=c.z+ddz/dd*min;}
    }
  }
  pos.x=Math.max(-ARENA,Math.min(ARENA,pos.x));
  pos.z=Math.max(-ARENA,Math.min(ARENA,pos.z));
}

// Fast ENV placement using pre-baked ENV_DIM (zero runtime Box3 calls!)
function envPlace(key,x,z,scale,rotY,sink,coll){
  var tpl=ENV_T[key],d=ENV_DIM[key];if(!tpl||!d)return null;
  var m=tpl.clone(true);
  m.scale.setScalar(scale);m.position.set(x,-d.minY*scale-(sink||0),z);if(rotY)m.rotation.y=rotY;
  scene.add(m);
  var sw=d.w*scale,sd=d.d*scale;
  if(coll==='box')addColliderBox(x,z,Math.max(0.3,sw/2*0.92),Math.max(0.3,sd/2*0.92));
  else if(coll==='circle')addColliderCircle(x,z,Math.max(sw,sd)/2*0.95);
  else if(coll==='gate'){addColliderBox(x-sw*0.40,z,Math.max(0.35,sw*0.11),Math.max(0.4,sd/2));addColliderBox(x+sw*0.40,z,Math.max(0.35,sw*0.11),Math.max(0.4,sd/2));}
  m.traverse(function(o){o.matrixAutoUpdate=false;o.updateMatrix();});
  window.__envPlaced=(window.__envPlaced||0)+1;
  return m;
}
function envPlaceH(key,x,z,h,rotY,coll,sink){var d=ENV_DIM[key];if(!d||!d.h)return null;return envPlace(key,x,z,h/d.h,rotY,sink||0,coll);}
function envPlaceW(key,x,z,w,rotY){var d=ENV_DIM[key];if(!d||!d.w||!d.h)return null;var s=w/d.w;return envPlace(key,x,z,s,rotY,(d.h*s)-0.06,null);}

function buildEnv(){
  envPlaceH('wall_door',0,30,6.0,0,'gate');
  envPlaceH('wall_step',-5.8,30,2.0,0,'box');envPlaceH('wall_step',5.8,30,2.0,0,'box');
  envPlaceH('wall_step',-11,30,2.0,0,'box');envPlaceH('wall_step',11,30,2.0,0,'box');
  envPlaceH('pillar',-4.4,37,3.5,0.3,'circle');envPlaceH('pillar',4.4,37,3.5,-0.3,'circle');
  envPlaceH('torch',-2.7,33.2,2.3,0,'circle');envPlaceH('torch',2.7,33.2,2.3,0,'circle');
  envPlaceH('stairs',0,34.8,1.0,0,null);
  envPlaceW('cobble',0,41,7,0);envPlaceW('cobble',0,48.5,7,0.5);
  envPlaceH('rocks',-8.5,41,1.2,0.7,'circle');envPlaceH('rocks',9.5,46,1.5,2.1,'circle');envPlaceH('rocks',-12,53,1.0,1.2,'circle');
  envPlaceH('house',13.5,-51,7.0,-0.35,'box');
  envPlaceH('watchtower',-10.5,-46,8.0,0.4,'box');
  envPlaceH('wall_step',-8.5,-41.5,1.8,0,'box');envPlaceH('wall_step',8.5,-41.5,1.8,0,'box');
  envPlaceH('wall_step',-14,-41.5,1.8,0,'box');envPlaceH('wall_step',14,-41.5,1.8,0,'box');
  envPlaceH('torch',-3.2,-38,2.3,0,'circle');envPlaceH('torch',3.2,-38,2.3,0,'circle');
  envPlaceH('lantern',-5.5,-33,2.1,0,'circle');envPlaceH('lantern',5.5,-33,2.1,0,'circle');
  envPlaceW('cobble',0,-36,8,0.2);
  envPlaceH('cart',44,-8,1.7,0.5,'box');envPlaceH('cart',50,9,1.7,2.6,'box');
  envPlaceH('horsecart',57,-15,1.8,0.9,'box');
  envPlaceH('crate',41,-6,1.15,0.4,'box');envPlaceH('crate',41,-6,1.15,0.9,'box',-1.1);envPlaceH('crate',42.3,-6.7,1.15,1.2,'box');
  envPlaceH('barrel',43.5,3,1.05,0,'circle');envPlaceH('barrelstack',47,-3.5,1.7,0.3,'circle');
  envPlaceH('table',39,14.5,1.05,0.2,'box');envPlaceH('table',52,16.5,1.05,1.1,'box');
  envPlaceH('chest',45,19,0.85,0.7,'circle');
  envPlaceH('windmill',63,23,10.0,0.8,'box');
  envPlaceH('lantern',36,16,2.1,0,'circle');envPlaceH('lantern',58,4,2.1,0,'circle');
  envPlaceH('pine',-36,-20,6.2,0.3,'circle');envPlaceH('pine',-42,-12,5.4,1.2,'circle');envPlaceH('pine',-50,-18,6.8,2.0,'circle');envPlaceH('pine',-38,-2,5.8,0.8,'circle');
  envPlaceH('pine',-46,4,6.4,1.7,'circle');envPlaceH('pine',-40,14,5.2,2.6,'circle');envPlaceH('pine',-52,20,6.6,0.1,'circle');envPlaceH('pine',-36,24,5.6,1.0,'circle');
  envPlaceH('deadtree',-44,-24,4.6,0.6,'circle');envPlaceH('deadtree',-56,14,5.2,2.2,'circle');
  envPlaceH('oak',-48,-8,5.4,1.4,'circle');envPlaceH('oak',-34,18,4.8,2.9,'circle');
  envPlaceH('bush',-39,-15,1.1,0.4,null);envPlaceH('bush',-51,-1,1.3,1.5,null);envPlaceH('bush',-43,10,1.0,2.4,null);envPlaceH('bush',-33,-24,1.2,0.9,null);
  envPlaceH('mushroom',-41,-6,0.55,0.3,null);envPlaceH('mushroom',-49,16,0.7,1.8,null);envPlaceH('mushroom',-37,21,0.5,2.7,null);
  envPlaceH('rocks',-53,-24,1.6,0.5,'circle');envPlaceH('rocks',-35,2,1.1,1.9,'circle');
  envPlaceH('lantern',-30,4,2.1,0,'circle');envPlaceH('lantern',-38,-4,2.1,0.7,'circle');envPlaceH('lantern',-47,4,2.1,1.3,'circle');
  envPlaceH('well',0,0,1.6,0.3,'circle');
  envPlaceH('pagoda',-10,9,6.5,0.4,'box');
  envPlaceH('stairs',-10,14.8,1.0,0.4,null);
  envPlaceW('cobble',0,1.8,10,0.2);envPlaceW('cobble',-9.5,10,8,0.9);
  envPlaceH('lantern',3.5,-4.5,2.1,0.2,'circle');envPlaceH('lantern',-4.5,3.5,2.1,1.1,'circle');envPlaceH('lantern',5,5.5,2.1,0.6,'circle');envPlaceH('lantern',-5.5,-5,2.1,1.9,'circle');
  envPlaceH('house',24,-34,5.5,-0.5,'box');
  envPlaceH('well',-8,-11,1.3,0.8,'circle');
  window.__envTemplatesLoaded=Object.keys(ENV_T).length;
  window.__envBuilt=window.__envTemplatesLoaded>0;
}

function loadAllWorldGLBs(){
  if(!window.__glbLoaders||!window.GLTFLoader||!window.SkeletonUtils){setTimeout(loadAllWorldGLBs,150);return;}
  var loader=new window.GLTFLoader();
  if(window.MeshoptDecoder){try{loader.setMeshoptDecoder(window.MeshoptDecoder);}catch(e){}}
  function zbFind(anims,names){for(var k=0;k<names.length;k++)for(var i=0;i<anims.length;i++)if(anims[i].name===names[k])return anims[i];for(var k=0;k<names.length;k++){var lk=names[k].toLowerCase();for(var i=0;i<anims.length;i++)if(anims[i].name.toLowerCase().indexOf(lk)>=0)return anims[i];}return null;}
  function zbClipMap(anims,spec){var out={};for(var r in spec)out[r]=spec[r].length?zbFind(anims,spec[r]):null;return out;}

  function startLoad(){
    ['zombie','ghost','skeleton','golem','orcking','troll','minotaur'].forEach(function(key){
      loader.load('assets/zb/zb_'+key+'.glb',function(g){
        toFastLambert(g.scene,0x353b32);
        var clips=zbClipMap(g.animations,ZB_SPEC[key]);
        // Pre-bake Box3 once per template!
        var tmpM=new THREE.AnimationMixer(g.scene);
        var c=clips.idle||clips.walk||clips.run;
        if(c){var act=tmpM.clipAction(c);act.play();tmpM.update(0.04);}
        g.scene.updateMatrixWorld(true);
        var bb=new THREE.Box3().setFromObject(g.scene);
        var mh=(bb.max.y-bb.min.y)||1.8;
        var unitScale=2.02/mh;
        var yOffset=-bb.min.y*unitScale;
        if(c){tmpM.stopAllAction();tmpM.update(0);}
        ZB_T[key]={scene:g.scene,clips:clips,unitScale:unitScale,yOffset:yOffset};
        window.__zbLoaded=Object.keys(ZB_T).length;
      },undefined,function(){console.warn('zb GLB load fail',key);});
    });

    ['pistol','shotgun','rifle','thuanthien'].forEach(function(kind){
      loader.load('assets/weapons/wp_'+kind+'.glb',function(g){
        hardenGunObj(g.scene);
        GUN_T[kind]=g.scene;
        if(curWeapon===kind)buildGun(kind);
      },undefined,function(){console.warn('weapon GLB fail',kind);});
    });

    var envLeft=ENV_KEYS.length;
    ENV_KEYS.forEach(function(key){
      loader.load('assets/env/env_'+key+'.glb',function(g){
        toFastLambert(g.scene,0x3c3a34,ENV_TINT[key]||1);
        g.scene.updateMatrixWorld(true);
        var bb=new THREE.Box3().setFromObject(g.scene),sz=new THREE.Vector3();bb.getSize(sz);
        ENV_T[key]=g.scene;
        ENV_DIM[key]={w:sz.x||1,h:sz.y||1,d:sz.z||1,minY:bb.min.y};
        if(--envLeft===0)buildEnv();
      },undefined,function(){if(--envLeft===0)buildEnv();});
    });
  }
  if(window.MeshoptDecoder&&window.MeshoptDecoder.ready)window.MeshoptDecoder.ready.then(startLoad).catch(startLoad);
  else startLoad();
}
