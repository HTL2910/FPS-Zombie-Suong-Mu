"use strict";
var wState={},curWeapon='pistol';
function resetWeapons(){wState={pistol:{mag:12,reserve:Infinity},shotgun:{mag:6,reserve:36},rifle:{mag:30,reserve:150},thuanthien:{mag:1,reserve:Infinity}};}
resetWeapons();

var gunParts={},gunBase={x:0.34,y:-0.34},swordSwingT=0;
var gunMats={body:new THREE.MeshLambertMaterial({color:0x1e2126}),metal:new THREE.MeshLambertMaterial({color:0x3c4148}),grip:new THREE.MeshLambertMaterial({color:0x4a3826})};
var handMat=new THREE.MeshLambertMaterial({color:0x8a6a52}),sleeveMat=new THREE.MeshLambertMaterial({color:0x2e332a});
var swordGlowMat=new THREE.MeshBasicMaterial({map:lampGlowTex,color:0xffd269,transparent:true,opacity:0.42,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});

function buildGun(kind){gunBase=(kind==='thuanthien')?{x:0.30,y:-0.28}:((kind==='pistol')?{x:0.34,y:-0.34}:{x:0.25,y:-0.245});if(GUN_T[kind]){buildGunGLB(kind);return;}buildGunBox(kind);}
function buildGunGLB(kind){
  while(gunGroup.children.length)gunGroup.remove(gunGroup.children[0]);
  var g=gunGroup;gunParts.pump=null;gunParts.swordGlow=null;
  var m=GUN_T[kind].clone(true);hardenGunObj(m);
  var bb=new THREE.Box3().setFromObject(m),sz=new THREE.Vector3();bb.getSize(sz);
  var len=Math.max(sz.x,sz.y,sz.z)||1;
  var target=(kind==='thuanthien'?0.78:(kind==='pistol'?0.36:(kind==='shotgun'?0.70:0.74)));
  m.scale.setScalar(target/len);
  var wrap=new THREE.Group();wrap.add(m);
  var bb2=new THREE.Box3().setFromObject(wrap),c=new THREE.Vector3();bb2.getCenter(c);
  m.position.set(-c.x,-c.y,-c.z);
  if(kind==='thuanthien'){
    m.traverse(function(o){
      if(!(o.isMesh||o.isSkinnedMesh)||!o.material)return;
      var mats=Array.isArray(o.material)?o.material:[o.material];
      for(var i=0;i<mats.length;i++){
        var mt=mats[i];if(!mt)continue;
        if(typeof mt.metalness==='number'&&mt.metalness>0.4)mt.metalness=0.35;
        if(mt.emissive){mt.emissive.setHex(0x704e10);mt.emissiveIntensity=0.45;}
      }
    });
    wrap.rotation.set(0.32,-0.55,-0.22);wrap.position.set(0.02,0.12,-0.12);
    var glow=new THREE.Mesh(new THREE.PlaneGeometry(0.24,0.74),swordGlowMat);
    glow.position.set(0,0.06,0);wrap.add(glow);gunParts.swordGlow=glow;
  }else{
    wrap.rotation.y=-Math.PI/2+(kind==='pistol'?0.05:0.17);
    wrap.position.set(kind==='pistol'?0:-0.05,kind==='pistol'?0.01:0.055,kind==='pistol'?0.04:-0.15);
    var h1=new THREE.Mesh(new THREE.BoxGeometry(0.044,0.046,0.082),handMat);
    var sl=new THREE.Mesh(new THREE.BoxGeometry(0.052,0.052,0.12),sleeveMat);
    if(kind==='pistol'){
      h1.position.set(0,-0.065,0.115);h1.rotation.x=0.22;
      sl.position.set(0.005,-0.09,0.205);sl.rotation.x=0.22;
    }else if(kind==='shotgun'){
      h1.position.set(-0.022,-0.005,0.015);h1.rotation.y=0.17;
      var h2=new THREE.Mesh(new THREE.BoxGeometry(0.046,0.040,0.09),handMat);
      h2.position.set(-0.072,-0.005,-0.27);h2.rotation.y=0.17;g.add(h2);
      sl.position.set(-0.006,-0.035,0.11);sl.rotation.set(0.22,0.17,0);
    }else{
      h1.position.set(-0.024,-0.015,0.005);h1.rotation.y=0.17;
      var h2r=new THREE.Mesh(new THREE.BoxGeometry(0.044,0.040,0.088),handMat);
      h2r.position.set(-0.075,-0.006,-0.285);h2r.rotation.y=0.17;g.add(h2r);
      sl.position.set(-0.008,-0.042,0.105);sl.rotation.set(0.22,0.17,0);
    }
    g.add(h1);g.add(sl);
  }
  g.add(wrap);
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.3),new THREE.MeshBasicMaterial({color:0xffd98a,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
  fl.position.set(0,0.03,kind==='pistol'?-0.24:-0.55);g.add(fl);gunParts.flash=fl;gunParts.muzzleZ=fl.position.z;
}
function buildGunBox(kind){
  while(gunGroup.children.length)gunGroup.remove(gunGroup.children[0]);
  var g=gunGroup;
  function bx(w,h,d,x,y,z,mat){var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat||gunMats.body);m.position.set(x,y,z);g.add(m);return m;}
  if(kind==='thuanthien'){bx(0.035,0.62,0.06,0,0.22,-0.15,new THREE.MeshLambertMaterial({color:0xefc45c}));bx(0.16,0.04,0.06,0,-0.04,-0.08,gunMats.metal);}
  else if(kind==='pistol'){bx(0.075,0.11,0.3,0,0.03,-0.05);bx(0.06,0.16,0.09,0,-0.09,0.06,gunMats.grip);}
  else if(kind==='shotgun'){bx(0.085,0.1,0.52,0,0.02,-0.12);bx(0.06,0.15,0.09,0,-0.09,0.1,gunMats.grip);}
  else{bx(0.07,0.1,0.56,0,0.03,-0.12);bx(0.05,0.2,0.07,0,-0.13,-0.02,gunMats.metal);}
  var fl=new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.3),new THREE.MeshBasicMaterial({color:0xffd98a,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
  fl.position.set(0,0.03,-0.35);g.add(fl);gunParts.flash=fl;gunParts.muzzleZ=-0.35;
}
buildGun('pistol');

// Pooled FX
var tracers=[],particles=[],casingsLive=[];
var tracerPool=[],partPool=[],casingPool=[],dmgPool=[];
var partGeo=new THREE.BoxGeometry(0.09,0.09,0.09),casingGeo=new THREE.BoxGeometry(0.018,0.018,0.05);
for(var i=0;i<16;i++){
  var lGeo=new THREE.BufferGeometry();lGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
  var l=new THREE.Line(lGeo,new THREE.LineBasicMaterial({color:0xffd98a,transparent:true,opacity:0.85}));l.frustumCulled=false;l.visible=false;scene.add(l);
  tracerPool.push({l:l,active:false,t:0});
}
for(var i=0;i<60;i++){
  var pm=new THREE.Mesh(partGeo,new THREE.MeshBasicMaterial({color:0xffffff}));pm.visible=false;scene.add(pm);
  partPool.push({m:pm,active:false,vx:0,vy:0,vz:0,t:0});
}
for(var i=0;i<12;i++){
  var cm=new THREE.Mesh(casingGeo,new THREE.MeshBasicMaterial({color:0xd8a83c}));cm.visible=false;scene.add(cm);
  casingPool.push({m:cm,active:false,vx:0,vy:0,vz:0,rx:0,rz:0,t:0});
}
for(var i=0;i<16;i++){
  var d=document.createElement('div');d.className='dmgnum';d.style.display='none';document.body.appendChild(d);
  dmgPool.push({el:d,t:0,wp:new THREE.Vector3()});
}
function addTracer(a,b){
  var rec=tracerPool.find(function(x){return !x.active;});if(!rec)return;
  var pa=rec.l.geometry.attributes.position.array;pa[0]=a.x;pa[1]=a.y;pa[2]=a.z;pa[3]=b.x;pa[4]=b.y;pa[5]=b.z;
  rec.l.geometry.attributes.position.needsUpdate=true;rec.l.material.opacity=0.85;rec.l.visible=true;rec.active=true;rec.t=0.09;tracers.push(rec);
}
var particleMul=1;
function burst(pos,color,n){
  n=Math.max(1,Math.round(n*particleMul));
  for(var i=0;i<n;i++){
    var rec=partPool.find(function(x){return !x.active;});if(!rec)return;
    rec.active=true;rec.m.visible=true;rec.m.material.color.setHex(color);rec.m.position.copy(pos);
    rec.vx=(Math.random()-0.5)*3.4;rec.vy=Math.random()*3.2;rec.vz=(Math.random()-0.5)*3.4;rec.t=0.45+Math.random()*0.25;
    particles.push(rec);
  }
}
function dmgNum(worldPos,amt,crit){
  for(var i=0;i<dmgPool.length;i++){var p=dmgPool[i];if(p.t<=0){p.t=0.7;p.wp.copy(worldPos);p.wp.x+=(Math.random()-0.5)*0.4;p.el.textContent=Math.round(amt);p.el.className='dmgnum'+(crit?' crit':'');p.el.style.display='block';return;}}
}
function spawnCasing(big){
  if(QLEVEL>=2)return;
  var rec=casingPool.find(function(x){return !x.active;});if(!rec)return;
  rec.active=true;rec.m.visible=true;var bs=big?1.7:1;rec.m.scale.set(bs,bs,bs);
  rec.m.position.copy(gunGroup.position);camera.localToWorld(rec.m.position);rec.m.position.y-=0.05;
  var _rxv=Math.cos(G.yaw),_rzv=-Math.sin(G.yaw),_fxv=-Math.sin(G.yaw),_fzv=-Math.cos(G.yaw),_rs=1.1+Math.random()*0.7;
  rec.vx=_rxv*_rs-_fxv*0.25;rec.vz=_rzv*_rs-_fzv*0.25;rec.vy=1.5+Math.random()*0.8;rec.rx=(Math.random()-0.5)*14;rec.rz=(Math.random()-0.5)*14;rec.t=0.55;casingsLive.push(rec);
}

// Zombies (ZERO material clones, pre-baked scale, shared hit-flash swap!)
var zombies=[],zombiePool={},_zCounter=0;
function zombieStats(type){
  var st={normal:{hp:60,speed:2.15,dmg:11,score:100},runner:{hp:42,speed:4.3,dmg:8,score:150},brute:{hp:240,speed:1.55,dmg:22,score:300},boss:{hp:1,speed:1.95,dmg:30,score:2000}}[type];
  var wv=G.wave,hp=Math.round(st.hp*(1+(wv-1)*0.16));if(type==='boss')hp=(wv>=10?2600:1250);
  return {hp:hp,speed:st.speed*(1+(wv-1)*0.03)*(0.9+Math.random()*0.2),dmg:st.dmg,score:st.score};
}
function playZombieAct(z,name,fade){
  var M=z.model;if(!M)return;
  var a=M.acts[name];if(!a&&name==='idle')a=M.acts.walk;if(!a)return;
  if(M.cur===name){if((name==='attack'||name==='hit')&&a.time>=a.getClip().duration-0.02){a.reset();a.play();}return;}
  var old=M.acts[M.cur];if(old&&old!==a)old.fadeOut(fade||0.15);
  a.reset();a.setEffectiveWeight(1);a.fadeIn(fade||0.15);a.play();M.cur=name;
}
function zombieModelAnim(z,dt,dist){
  var M=z.model;if(!M)return;
  if(dist>=26&&!z.isBoss)return;
  if(dist>=14&&!z.isBoss){z._acc=(z._acc||0)+dt;if(((_frameNo+z._id)%3)!==0)return;dt=z._acc;z._acc=0;}
  if(z.spawnT>0){z.spawnT-=dt;var sr=Math.max(0,z.spawnT/1.4);z.group.position.y=-2.1*z.group.scale.y*sr*sr;playZombieAct(z,'idle',0.2);}
  else{
    var want;
    if(z.atkT>0){z.atkT-=dt;want='attack';if(!M.acts.attack){want=(z.type==='runner'&&G.wave>=8&&M.acts.sprint)?'sprint':'run';var _ldx=playerPos.x-z.group.position.x,_ldz=playerPos.z-z.group.position.z,_ld=Math.hypot(_ldx,_ldz)||1;z.group.position.x+=_ldx/_ld*dt*1.7;z.group.position.z+=_ldz/_ld*dt*1.7;}}
    else if(z.hitT>0){z.hitT-=dt;want='hit';z.group.position.x-=Math.sin(z.group.rotation.y)*dt*1.6;z.group.position.z-=Math.cos(z.group.rotation.y)*dt*1.6;}
    else if(dist>1.3)want=(z.type==='runner')?((G.wave>=8&&M.acts.sprint)?'sprint':'run'):(z.walkName||'walk');
    else want='idle';
    playZombieAct(z,want,0.14);
  }
  M.mixer.update(dt);
}
function triggerBossRoar(z){
  if(!z||z.dead)return;
  z.roarT=10;
  G.shake=Math.min(0.55,G.shake+0.34);
  var df=document.getElementById('dmgFlash');
  if(df){df.style.transition='none';df.style.opacity=0.52;setTimeout(function(){df.style.transition='opacity .55s';df.style.opacity=0;},50);}
  sfxGroan();
  if(AC)playTone(75,0.45,0.32,'sawtooth',32);
  if(z.model)playZombieAct(z,(z.model.acts.special&&Math.random()<0.5)?'special':'attack',0.1);
  var gp=z.group.position;
  _burstV.set(gp.x,0.6,gp.z);burst(_burstV,0xff3b28,10);
  var aliveCount=0;for(var ai=0;ai<zombies.length;ai++)if(!zombies[ai].dead)aliveCount++;
  if(aliveCount<36){
    for(var k=0;k<2;k++){
      var rz=spawnZombie('runner');
      var ang=z.group.rotation.y+(k===0?1.15:-1.15);
      var rx=Math.max(-ARENA+6,Math.min(ARENA-6,gp.x+Math.cos(ang)*4.5));
      var rzp=Math.max(-ARENA+6,Math.min(ARENA-6,gp.z+Math.sin(ang)*4.5));
      rz.group.position.set(rx,-2.1*rz.group.scale.y*(0.6/1.4),rzp);
      collide(rz.group.position,0.5*rz.group.scale.x);
      rz.spawnT=0.6;rz.graceT=0.5;
      _burstV.set(rz.group.position.x,0.3,rz.group.position.z);burst(_burstV,0x5a4a33,4);
    }
  }
  updateHUD();
}
function setZombieFlash(z,on){
  if(z._flashing===on)return;
  z._flashing=on;
  for(var i=0;i<z.meshes.length;i++){
    var m=z.meshes[i];
    m.material=on?HIT_FLASH_MAT:m.userData.origMat;
  }
}
function makeZombie(type){
  var isBoss=(type==='boss'),sc=isBoss?2.2:(type==='brute'?1.5:(type==='runner'?0.95:1.0));
  var key;if(type==='runner')key='skeleton';else if(isBoss)key='orcking';else if(type==='brute'){var _bk=['golem','troll','minotaur'];key=_bk[(_zCounter)%_bk.length];if(!ZB_T[key])key='golem';}else{key=(_zCounter%3===2)?'ghost':'zombie';}
  var id=_zCounter++;
  var tpl=ZB_T[key]||ZB_T.zombie;
  var g=new THREE.Group();g.rotation.order='YXZ';
  var meshes=[],modelObj=null;
  if(tpl){
    var model=window.SkeletonUtils.clone(tpl.scene);
    model.scale.setScalar(tpl.unitScale);
    model.position.y=tpl.yOffset;
    var mixer=new THREE.AnimationMixer(model),acts={};
    function reg(nm,clip,loop){if(!clip)return;var a=mixer.clipAction(clip);if(!loop){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;}acts[nm]=a;}
    reg('idle',tpl.clips.idle,true);reg('walk',tpl.clips.walk,true);reg('run',tpl.clips.run||tpl.clips.walk,true);
    reg('attack',tpl.clips.attack,false);reg('hit',tpl.clips.hit,false);reg('walk2',tpl.clips.walk2,true);reg('walk3',tpl.clips.walk3,true);reg('sprint',tpl.clips.sprint,true);reg('special',tpl.clips.special,false);
    var _wn='walk';if(key==='zombie'){var _wp=[];['walk','walk2','walk3'].forEach(function(n){if(acts[n])_wp.push(n);});if(_wp.length)_wn=_wp[Math.floor(Math.random()*_wp.length)];}
    model.traverse(function(o){if(o.isMesh||o.isSkinnedMesh){o.frustumCulled=false;o.userData.origMat=o.material;meshes.push(o);}});
    g.add(model);
    modelObj={mixer:mixer,acts:acts,cur:''};
  }else{
    var fbMat=new THREE.MeshLambertMaterial({color:0x5d7350});
    var fb=new THREE.Mesh(new THREE.BoxGeometry(0.7,1.8,0.5),fbMat);fb.position.y=0.9;fb.userData.origMat=fbMat;meshes.push(fb);g.add(fb);
  }
  var barG=new THREE.Group();barG.position.y=2.15;g.add(barG);
  var barBg=new THREE.Mesh(new THREE.PlaneGeometry(0.85,0.11),new THREE.MeshBasicMaterial({color:0x101010,side:THREE.DoubleSide,depthTest:false}));barBg.renderOrder=5;barG.add(barBg);
  var barFg=new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.075),new THREE.MeshBasicMaterial({color:isBoss?0xff3020:0x7ec850,side:THREE.DoubleSide,depthTest:false}));barFg.renderOrder=6;barFg.position.z=0.005;barG.add(barFg);
  g.scale.setScalar(sc);scene.add(g);
  var _st=zombieStats(type);
  var z={_id:id,type:type,isBoss:isBoss,group:g,meshes:meshes,barG:barG,barFg:barFg,hp:_st.hp,maxHp:_st.hp,speed:_st.speed,dmg:_st.dmg,score:_st.score,hitR:0.55*sc,dead:false,deathT:0,flashT:0,hitT:0,atkT:0,atkCd:0,graceT:0,roarT:isBoss?4.5:0,spawnT:1.4,_acc:0,_flashing:false,phase:Math.random()*10,model:modelObj,walkName:_wn||'walk'};
  if(modelObj)playZombieAct(z,'idle',0);
  return z;
}
function resetZombie(z){
  var st=zombieStats(z.type);z.hp=st.hp;z.maxHp=st.hp;z.speed=st.speed;z.dmg=st.dmg;z.score=st.score;
  z.dead=false;z.deathT=0;z.flashT=0;z.hitT=0;z.atkT=0;z.atkCd=0;z.graceT=0;z.roarT=z.isBoss?4.5:0;z._acc=0;z.phase=Math.random()*10;
  setZombieFlash(z,false);
  z.group.rotation.set(0,0,0);z.group.visible=true;
  if(z.model){for(var k in z.model.acts)z.model.acts[k].stop();z.model.cur='';playZombieAct(z,'idle',0);}
  z.barG.visible=true;z.barFg.scale.x=1;z.barFg.position.x=0;scene.add(z.group);
}
function spawnZombie(type){
  var _zp=zombiePool[type];
  var z=(_zp&&_zp.length)?_zp.pop():null;
  if(z)resetZombie(z);else z=makeZombie(type);
  var ang=Math.random()*Math.PI*2,dist=26+Math.random()*8;
  var x=playerPos.x+Math.cos(ang)*dist,zp=playerPos.z+Math.sin(ang)*dist;
  if(type==='boss'){x=playerPos.x+(Math.random()*14-7);zp=playerPos.z-(30+Math.random()*6);}
  x=Math.max(-ARENA+6,Math.min(ARENA-6,x));zp=Math.max(-ARENA+6,Math.min(ARENA-6,zp));
  if(type!=='boss'&&Math.hypot(x-playerPos.x,zp-playerPos.z)<13){x=-x;zp=-zp;}
  z.group.position.set(x,-2.1*z.group.scale.y,zp);z.spawnT=1.4;
  _burstV.set(x,0.4,zp);burst(_burstV,0x5a4a33,6);
  zombies.push(z);if(z.isBoss){bossRef=z;sfxSting();}
  return z;
}

// Pickups & Notes
var pickups=[],notes=[],notesFound=0;
var medMat=new THREE.MeshLambertMaterial({color:0xe8e4da}),medCross=new THREE.MeshBasicMaterial({color:0xd21f2c}),ammoMat=new THREE.MeshLambertMaterial({color:0x5a6136}),ammoTip=new THREE.MeshBasicMaterial({color:0xd8b34a});
function dropPickup(x,z){
  var kind=Math.random()<0.45?'med':'ammo',g=new THREE.Group();
  if(kind==='med'){var b=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.34,0.38),medMat);b.position.y=0.32;g.add(b);var c=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.06,0.08),medCross);c.position.y=0.5;g.add(c);}
  else{var b2=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.34,0.38),ammoMat);b2.position.y=0.32;g.add(b2);var tip=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.1,0.28),ammoTip);tip.position.y=0.54;g.add(tip);}
  g.position.set(x,0,z);scene.add(g);pickups.push({g:g,kind:kind,t:Math.random()*5});
}
var notePaperMat=new THREE.MeshLambertMaterial({color:0xe9e2cc}),noteRingMat=new THREE.MeshBasicMaterial({color:0xffd76b,transparent:true,opacity:0.75,side:THREE.DoubleSide,depthWrite:false});
function buildNotes(){
  for(var i=0;i<notes.length;i++)scene.remove(notes[i].g);notes=[];notesFound=0;_setTxt('hNotes','0');
  NOTE_DEFS.forEach(function(d){
    var g=new THREE.Group();
    var paper=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.03,0.75),notePaperMat);paper.position.y=0.32;g.add(paper);
    var ring=new THREE.Mesh(new THREE.RingGeometry(0.55,0.78,24),noteRingMat);ring.rotation.x=-Math.PI/2;ring.position.y=0.1;g.add(ring);
    g.position.set(d.x,0,d.z);scene.add(g);notes.push({g:g,ring:ring,paper:paper,key:d.key,t:Math.random()*5});
  });
}
var noteToastTimer=null;
function showNoteToast(txt){var el=document.getElementById('noteToast');el.textContent='📄 '+txt;el.classList.add('show');clearTimeout(noteToastTimer);noteToastTimer=setTimeout(function(){el.classList.remove('show');},4600);}
function collectNote(n){scene.remove(n.g);notes.splice(notes.indexOf(n),1);notesFound++;G.score+=150;_setTxt('hNotes',String(notesFound));showNoteToast(t(n.key));sfxPickup();FPSApi.saveProfile({notes:[n.key]});updateHUD();}

// Supply Caches (4 outer district respawnable caches, ZERO PointLights)
var supplies=[];
var supCrateMat=new THREE.MeshLambertMaterial({color:0x2d5438}),supGlowMat=new THREE.MeshBasicMaterial({color:0x42ff94});
var supRingMat=new THREE.MeshBasicMaterial({map:lampGlowTex,color:0x38ff8c,transparent:true,opacity:0.62,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
var supHaloRingMat=new THREE.MeshBasicMaterial({color:0x4cff9a,transparent:true,opacity:0.75,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
function buildSupplies(){
  for(var i=0;i<supplies.length;i++)scene.remove(supplies[i].g);
  supplies=[];
  SUPPLY_DEFS.forEach(function(d){
    var g=new THREE.Group();
    var box=new THREE.Mesh(new THREE.BoxGeometry(0.92,0.54,0.68),supCrateMat);box.position.y=0.34;g.add(box);
    var band=new THREE.Mesh(new THREE.BoxGeometry(0.96,0.1,0.72),supGlowMat);band.position.y=0.42;g.add(band);
    var c1=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.06,0.12),supGlowMat);c1.position.y=0.64;g.add(c1);
    var c2=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.06,0.36),supGlowMat);c2.position.y=0.64;g.add(c2);
    var disc=new THREE.Mesh(new THREE.PlaneGeometry(3.0,3.0),supRingMat);disc.rotation.x=-Math.PI/2;disc.position.y=0.04;g.add(disc);
    var ring=new THREE.Mesh(new THREE.RingGeometry(0.85,1.08,24),supHaloRingMat);ring.rotation.x=-Math.PI/2;ring.position.y=0.06;g.add(ring);
    g.position.set(d.x,0,d.z);scene.add(g);
    supplies.push({g:g,box:box,ring:ring,x:d.x,z:d.z,zone:d.zone,cd:0,t:Math.random()*5});
  });
}
buildSupplies();

// Bom Lua Thanh (Incendiary Flare fireZones pool, ZERO PointLights)
var fireZones=[];
var fireGlowMatBase=new THREE.MeshBasicMaterial({map:lampGlowTex,color:0xff6a1a,transparent:true,opacity:0.75,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
var fireCoreMatBase=new THREE.MeshBasicMaterial({map:lampGlowTex,color:0xffe066,transparent:true,opacity:0.65,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
var fireRingMatBase=new THREE.MeshBasicMaterial({color:0xff9c2a,transparent:true,opacity:0.85,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
for(var fi=0;fi<4;fi++){
  var fg=new THREE.Group();
  var fDisc=new THREE.Mesh(new THREE.PlaneGeometry(8.6,8.6),fireGlowMatBase.clone());fDisc.rotation.x=-Math.PI/2;fDisc.position.y=0.04;fg.add(fDisc);
  var fCore=new THREE.Mesh(new THREE.PlaneGeometry(3.8,3.8),fireCoreMatBase.clone());fCore.rotation.x=-Math.PI/2;fCore.position.y=0.05;fg.add(fCore);
  var fRing=new THREE.Mesh(new THREE.RingGeometry(3.8,4.25,28),fireRingMatBase.clone());fRing.rotation.x=-Math.PI/2;fRing.position.y=0.06;fg.add(fRing);
  fg.visible=false;scene.add(fg);
  fireZones.push({g:fg,disc:fDisc,core:fCore,ring:fRing,active:false,t:0,tickT:0,sparkT:0,x:0,z:0,r:4.25});
}
function clearFireZones(){for(var i=0;i<fireZones.length;i++){fireZones[i].active=false;fireZones[i].t=0;fireZones[i].g.visible=false;}}
function throwFlare(){
  if(G.state!=='playing'||G.flareCd>0)return false;
  G.flareCd=12;
  var fx=-Math.sin(G.yaw),fz=-Math.cos(G.yaw);
  var tmp=_sv1.set(playerPos.x,1.7,playerPos.z);
  for(var step=0;step<10;step++){
    tmp.x+=fx*0.8;tmp.z+=fz*0.8;
    var bx=tmp.x,bz=tmp.z;collide(tmp,0.4);
    if(Math.hypot(tmp.x-bx,tmp.z-bz)>0.25)break;
  }
  var tx=Math.max(-ARENA+3,Math.min(ARENA-3,tmp.x)),tz=Math.max(-ARENA+3,Math.min(ARENA-3,tmp.z));
  addTracer(_sv2.set(playerPos.x+fx*0.5,playerPos.y-0.15,playerPos.z+fz*0.5),_sv3.set(tx,0.2,tz));
  burst(_sv3,0xff8c2a,10);
  var zone=null,oldest=1e9;
  for(var i=0;i<fireZones.length;i++){
    if(!fireZones[i].active){zone=fireZones[i];break;}
    if(fireZones[i].t<oldest){oldest=fireZones[i].t;zone=fireZones[i];}
  }
  if(zone){
    zone.active=true;zone.t=5.5;zone.tickT=0.05;zone.sparkT=0;zone.x=tx;zone.z=tz;
    zone.g.position.set(tx,0,tz);zone.g.visible=true;
    zone.disc.material.opacity=0.75;zone.core.material.opacity=0.65;zone.ring.material.opacity=0.85;
    zone.ring.scale.setScalar(1);
  }
  if(AC){playNoise(0.24,1400,0.45,'bandpass');playTone(320,0.22,0.25,'sawtooth',110);}
  updateHUD();
  return true;
}
function updateFireZones(dt,now){
  for(var i=0;i<fireZones.length;i++){
    var z=fireZones[i];if(!z.active)continue;
    z.t-=dt;
    if(z.t<=0){z.active=false;z.g.visible=false;continue;}
    var fade=Math.min(1,z.t/0.8),pulse=0.85+0.15*Math.sin(now*0.012+i);
    z.disc.material.opacity=0.72*fade*pulse;z.core.material.opacity=0.62*fade;z.ring.material.opacity=0.85*fade;
    z.ring.scale.setScalar(0.96+0.05*Math.sin(now*0.01+i));
    z.sparkT-=dt;
    if(z.sparkT<=0){
      z.sparkT=0.18;
      var a=Math.random()*Math.PI*2,rad=Math.random()*z.r*0.72;
      _burstV.set(z.x+Math.cos(a)*rad,0.25,z.z+Math.sin(a)*rad);burst(_burstV,0xff7b22,2);
    }
    z.tickT-=dt;
    while(z.tickT<=0){
      z.tickT+=0.4;
      for(var zi=zombies.length-1;zi>=0;zi--){
        var zb=zombies[zi];if(zb.dead)continue;
        var gp=zb.group.position;
        if(Math.hypot(gp.x-z.x,gp.z-z.z)<=z.r+zb.hitR*0.4){
          var pt=_hitPt.set(gp.x,1.1*zb.group.scale.y,gp.z);
          damageZombie(zb,28*G.dmgMul,false,pt);
          burst(pt,0xff8c2a,3);
        }
      }
    }
  }
}

// Combat
var raycaster=new THREE.Raycaster();
var _sv1=new THREE.Vector3(),_sv2=new THREE.Vector3(),_sv3=new THREE.Vector3(),_sv4=new THREE.Vector3(),_sv5=new THREE.Vector3(),_sv6=new THREE.Vector3(),_sv7=new THREE.Vector3(),_hitPt=new THREE.Vector3(),_burstV=new THREE.Vector3(),_svE=new THREE.Vector3(),_mzV=new THREE.Vector3();

function shoot(){
  if(G.state!=='playing'||G.reloading)return;
  var now=performance.now(),W=WEAPONS[curWeapon],st=wState[curWeapon];
  if(now-G.lastShot<W.rate/G.rateMul)return;
  if(W.melee){
    G.lastShot=now;swordSwingT=0.32;sfxShoot('thuanthien');
    G.xhairKick=Math.min(0.65,(G.xhairKick||0)+0.35);
    muzzleLight.intensity=34;muzzleLight.position.set(gunGroup.position.x,gunGroup.position.y+0.04,gunGroup.position.z-0.35);G.shake=Math.min(0.4,G.shake+0.08);
    var origin=_sv1;camera.getWorldPosition(origin);
    var fwd=_sv2.set(0,0,-1).applyQuaternion(camera.quaternion).setY(0).normalize();
    _svE.copy(origin).addScaledVector(fwd,2.2);_svE.y=1.2;burst(_svE,0xffe478,8);
    for(var zi=zombies.length-1;zi>=0;zi--){
      var zz=zombies[zi];if(zz.dead)continue;var zp=zz.group.position;
      var dx=zp.x-origin.x,dz=zp.z-origin.z,dist=Math.hypot(dx,dz);
      if(dist<=5.8&&(dx*fwd.x+dz*fwd.z)/Math.max(0.01,dist)>0.28){
        var pt=_hitPt.set(zp.x,1.25*zz.group.scale.y,zp.z);
        damageZombie(zz,W.dmg*G.dmgMul*(0.9+Math.random()*0.25),dist<3.2,pt);burst(pt,0xffd54f,6);
      }
    }
    updateHUD();return;
  }
  if(st.mag<=0){playTone(900,0.05,0.12,'square');startReload();return;}
  G.lastShot=now;st.mag--;sfxShoot(curWeapon);
  gunParts.flash.material.opacity=0.95;gunParts.flash.rotation.z=Math.random()*Math.PI;gunParts.flash.scale.setScalar(curWeapon==='shotgun'?1.5:1);
  muzzleLight.intensity=(curWeapon==='shotgun'?46:30);muzzleLight.position.set(gunGroup.position.x,gunGroup.position.y+0.04,gunGroup.position.z+(gunParts.muzzleZ||-0.45));
  G.shake=Math.min(0.4,G.shake+W.recoil*4);
  G.xhairKick=Math.min(0.85,(G.xhairKick||0)+(curWeapon==='shotgun'?0.65:(curWeapon==='pistol'?0.38:0.25)));
  var _rk=W.recoil*(0.7+Math.random()*0.5);G.pitch+=_rk;gunGroup.position.z=-0.62+W.kick;
  spawnCasing(curWeapon==='shotgun');
  var origin=_sv1;camera.getWorldPosition(origin);
  for(var p=0;p<W.pellets;p++){
    var dir=_sv2.set((Math.random()-0.5)*2*W.spread,(Math.random()-0.5)*2*W.spread,-1).normalize();dir.applyQuaternion(camera.quaternion);
    raycaster.set(origin,dir);raycaster.far=90;
    var best=null,bestDist=1e9;
    for(var i=0;i<zombies.length;i++){
      var z=zombies[i];if(z.dead)continue;var zp=z.group.position;
      var center=_sv3.set(zp.x,1.05*z.group.scale.y,zp.z);
      var d=raycaster.ray.distanceToPoint(center);
      if(d<z.hitR){var along=_sv4.copy(center).sub(origin).dot(dir);if(along>0&&along<bestDist){bestDist=along;best={z:z,head:false,point:_hitPt.copy(origin).addScaledVector(dir,along)};}}
      var hc=_sv5.set(zp.x,1.85*z.group.scale.y,zp.z);var dh=raycaster.ray.distanceToPoint(hc);
      if(dh<0.34*z.group.scale.y){var al2=_sv4.copy(hc).sub(origin).dot(dir);if(al2>0&&al2<bestDist){bestDist=al2;best={z:z,head:true,point:_hitPt.copy(origin).addScaledVector(dir,al2)};}}
    }
    var end=_sv6.copy(origin).addScaledVector(dir,best?bestDist:55);
    addTracer(_sv7.set(0.3,-0.28,-0.9).applyMatrix4(camera.matrixWorld),end);
    if(best){var dmg=W.dmg*G.dmgMul*(best.head?2:1)*(0.9+Math.random()*0.2);damageZombie(best.z,dmg,best.head,best.point);}
  }
  if(st.mag===0)setTimeout(function(){if(G.state==='playing')startReload();},250);
  updateHUD();
}
function damageZombie(z,dmg,head,point){
  if(z.model&&z.model.acts.hit){z.model.acts.hit.stop();z.model.cur='';}
  z.hp-=dmg;z.flashT=0.09;z.hitT=head?0.42:0.28;setZombieFlash(z,true);
  showHitmarker(false);burst(point,0xb01018,head?6:4);dmgNum(point,dmg,head);sfxHit(false);
  if(head)playTone(1500,0.05,0.16,'square');
  if(z.hp<=0&&!z.dead)killZombie(z);
}
function killZombie(z){
  z.dead=true;z.deathT=0;setZombieFlash(z,false);
  if(z.model){for(var _dk in z.model.acts)z.model.acts[_dk].fadeOut(0.12);z.model.cur='';}
  G.kills++;G.score+=z.score;showHitmarker(true);sfxHit(true);
  _burstV.copy(z.group.position);_burstV.y=1.2;burst(_burstV,0x8f1420,8);
  if(z.isBoss){bossRef=null;document.getElementById('bossWrap').classList.add('hidden');G.score+=1000;}
  if(Math.random()<0.20)dropPickup(z.group.position.x,z.group.position.z);
  updateHUD();
}
function showHitmarker(kill){var h=document.getElementById('hitmarker');h.className=kill?'kill':'';h.style.opacity=1;setTimeout(function(){h.style.opacity=0;},kill?190:120);}
function startReload(){var st=wState[curWeapon],W=WEAPONS[curWeapon];if(W.melee||G.reloading||st.mag>=W.mag||st.reserve<=0)return;G.reloading=true;G.reloadDur=W.reload*G.reloadMul;G.reloadEnd=performance.now()+G.reloadDur;sfxReload();updateHUD();}
function finishReload(){var st=wState[curWeapon],W=WEAPONS[curWeapon],need=W.mag-st.mag,take=st.reserve===Infinity?need:Math.min(need,st.reserve);st.mag+=take;if(st.reserve!==Infinity)st.reserve-=take;G.reloading=false;updateHUD();}
function switchWeapon(k){if(!WEAPONS[k]||k===curWeapon)return;switchT=0.38;setTimeout(function(){curWeapon=k;buildGun(k);updateHUD();},140);G.reloading=false;playTone(400,0.06,0.12,'square');}
