"use strict";
var G={state:'menu',hp:100,maxHp:100,score:0,kills:0,wave:0,time:0,dmgMul:1,rateMul:1,speedMul:1,reloadMul:1,armor:0,yaw:0,pitch:0,vy:0,grounded:true,lastShot:0,reloading:false,reloadEnd:0,shake:0,bobT:0,flashOn:true,mouseDown:false,keys:{},startTime:0};
var playerPos=new THREE.Vector3(0,1.7,40);
var spawnTimer=0,bossRef=null,waveActive=false,groanTimer=3,scareTimer=14,hurtCd=0,pendingSpawns=[];
var gunDip=0,switchT=0,heartTimer=0,bigScareCd=0,crowTimer=9;
var swayX=0,swayY=0,lastYaw=0,lastPitch=0,dmgDirTimer=null;

function waveComp(w){
  var list=[],total=5+w*3;
  for(var i=0;i<total;i++){var r=Math.random(),ty='normal';if(w>=3&&r<0.16+w*0.012)ty='brute';else if(w>=2&&r<0.45)ty='runner';list.push(ty);}
  if(w===5||w===10)list.push('boss');
  return list;
}
function startWave(w){
  G.wave=w;waveActive=true;pendingSpawns=waveComp(w);spawnTimer=1.2;
  if(w===5)announce(t('bossAnn'),t('bossStory5'));
  else if(w===10)announce(t('finalAnn'),t('bossStory10'));
  else announce(t('waveAnn')+' '+w,'');
  updateHUD();
}
function heal(n){G.hp=Math.min(G.maxHp,G.hp+n);updateHUD();}
function hurtPlayer(dmg,fromX,fromZ){
  if(G.state!=='playing')return;
  var now=performance.now();if(now<hurtCd)return;hurtCd=now+350;
  if(fromX!==undefined){
    var _ddx=fromX-playerPos.x,_ddz=fromZ-playerPos.z;
    var _ang=Math.atan2(_ddx*Math.cos(G.yaw)+_ddz*(-Math.sin(G.yaw)),_ddx*(-Math.sin(G.yaw))+_ddz*(-Math.cos(G.yaw)))*180/Math.PI;
    var _de=document.getElementById('dmgDir');document.getElementById('dmgDirRot').style.transform='rotate('+_ang+'deg)';
    _de.style.opacity=1;clearTimeout(dmgDirTimer);dmgDirTimer=setTimeout(function(){_de.style.opacity=0;},420);
  }
  G.hp-=dmg*(1-G.armor);sfxHurt();G.shake=Math.min(0.5,G.shake+0.22);
  var vf=document.getElementById('vignette');vf.style.opacity=Math.min(1,1-G.hp/G.maxHp+0.35);
  var df=document.getElementById('dmgFlash');df.style.transition='none';df.style.opacity=1;setTimeout(function(){df.style.transition='opacity .5s';df.style.opacity=0;},40);
  if(G.hp<=0){G.hp=0;endGame(false);}
  updateHUD();
}

var plHeld=false,plFallback=false,plFailCount=0,plReqAt=0;
function isLocked(){return document.pointerLockElement===renderer.domElement;}
function updateLockHint(){
  var h=document.getElementById('lockHint');if(!h)return;
  var show=G.state==='playing'&&!document.body.classList.contains('touch')&&!isLocked();
  h.classList.toggle('hidden',!show);
  var _tx=plFallback?t('lockHintFb'):t('lockHint');if(h.textContent!==_tx)h.textContent=_tx;
}
function lockPointer(){
  if(document.body.classList.contains('touch')||isLocked())return;
  if(plFallback&&plFailCount>0&&performance.now()-plReqAt<3000){updateLockHint();return;}
  var now=performance.now();if(now-plReqAt<350)return;plReqAt=now;
  try{var res=renderer.domElement.requestPointerLock();if(res&&typeof res.catch==='function')res.catch(function(){plFailCount++;plFallback=true;updateLockHint();});}
  catch(e){plFailCount++;plFallback=true;updateLockHint();}
}

function clearZombies(){
  for(var i=0;i<zombies.length;i++){scene.remove(zombies[i].group);var pt=zombiePool[zombies[i].type]||(zombiePool[zombies[i].type]=[]);if(pt.length<12)pt.push(zombies[i]);}
  zombies=[];
  for(var i=0;i<pickups.length;i++)scene.remove(pickups[i].g);pickups=[];
}
function resetPlayer(){
  clearZombies();G.hp=100;G.maxHp=100;G.score=0;G.kills=0;G.wave=0;G.time=0;G.dmgMul=1;G.rateMul=1;G.speedMul=1;G.reloadMul=1;G.armor=0;G.yaw=0;G.pitch=0;G.reloading=false;G.shake=0;bossRef=null;
  resetWeapons();curWeapon='pistol';buildGun('pistol');playerPos.set(0,1.7,40);visitedZones={};curZone='';buildNotes();
  document.getElementById('bossWrap').classList.add('hidden');
}
function startGame(){
  initAudio();startAmbient();resetPlayer();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('endScr').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  G.startTime=performance.now();G.state='story';
  document.getElementById('storyScr').classList.remove('hidden');
  updateHUD();
}
document.getElementById('btnStoryGo').onclick=function(){
  document.getElementById('storyScr').classList.add('hidden');
  G.state='playing';G.startTime=performance.now();
  document.body.classList.add('playing');
  lockPointer();startWave(1);
};
document.getElementById('btnStart').onclick=startGame;
document.getElementById('btnStory').onclick=function(){document.getElementById('menu').classList.add('hidden');document.getElementById('storyScr').classList.remove('hidden');};

function pauseGame(){if(G.state!=='playing')return;G.state='paused';document.body.classList.remove('playing');if(document.exitPointerLock)document.exitPointerLock();document.getElementById('pauseScr').classList.remove('hidden');updateLockHint();}
function resumeGame(){if(G.state!=='paused')return;document.getElementById('pauseScr').classList.add('hidden');G.state='playing';document.body.classList.add('playing');lockPointer();updateLockHint();}
function toMenu(){clearZombies();G.state='menu';document.body.classList.remove('playing');if(document.exitPointerLock)document.exitPointerLock();['hud','pauseScr','endScr','upgradeScr','storyScr'].forEach(function(id){document.getElementById(id).classList.add('hidden');});document.getElementById('menu').classList.remove('hidden');syncBackendUI();}
function endGame(win){
  G.state='end';document.body.classList.remove('playing');if(document.exitPointerLock)document.exitPointerLock();
  var et=document.getElementById('endTitle');et.textContent=win?t('winT'):t('loseT');et.className='title'+(win?' win':'');
  document.getElementById('endSub').textContent=win?t('winS'):t('loseS');
  document.getElementById('eScore').textContent=G.score;document.getElementById('eKills').textContent=G.kills;document.getElementById('eWave').textContent=G.wave;document.getElementById('eTime').textContent=fmtTime(G.time);
  document.getElementById('endScr').classList.remove('hidden');
  FPSApi.saveProfile({score:G.score,wave:G.wave,killsDelta:G.kills,completedRun:true});
  FPSApi.submitScore({name:'Player',score:G.score,wave:G.wave,kills:G.kills,win:win});
}
document.getElementById('btnResume').onclick=resumeGame;
document.getElementById('btnRestart2').onclick=function(){document.getElementById('pauseScr').classList.add('hidden');startGame();};
document.getElementById('btnAgain').onclick=startGame;
document.getElementById('btnQuit').onclick=toMenu;document.getElementById('btnMenu2').onclick=toMenu;

// Volume & Quality
var volSlider=document.getElementById('volSlider'),volVal=document.getElementById('volVal'),volMute=document.getElementById('volMute'),muteBtn=document.getElementById('muteBtn');
function setVol(v){if(masterGain)masterGain.gain.value=v/100;volVal.textContent=v+'%';muteBtn.textContent=(v===0?'🔇 0%':'🔊 '+v+'%');}
volSlider.oninput=function(){initAudio();setVol(Number(volSlider.value));};
volMute.onclick=function(){initAudio();var next=Number(volSlider.value)>0?0:70;volSlider.value=next;setVol(next);};
muteBtn.onclick=volMute.onclick;

var QMODE='auto',QLEVEL=1,QNAMES=['CAO','TRUNG','THẤP'];
function applyQuality(){
  var dpr=QLEVEL===0?Math.min(devicePixelRatio||1,1.25):(QLEVEL===1?1:0.8);
  renderer.setPixelRatio(dpr);
  particleMul=QLEVEL===0?1:(QLEVEL===1?0.6:0.3);
  dustPts.visible=QLEVEL<2;rainPts.visible=QLEVEL<2;
  var qb=document.getElementById('qBadge');if(qb)qb.textContent='Q: '+QMODE.toUpperCase()+' · '+QNAMES[QLEVEL];
}
function setQualityMode(m){QMODE=m;QLEVEL=m==='high'?0:(m==='low'?2:1);applyQuality();var s1=document.getElementById('qSel'),s2=document.getElementById('qSelP');if(s1)s1.value=m;if(s2)s2.value=m;}
document.getElementById('qSel').addEventListener('change',function(){setQualityMode(this.value);});
document.getElementById('qSelP').addEventListener('change',function(){setQualityMode(this.value);});
applyQuality();

// Input
document.addEventListener('keydown',function(e){
  G.keys[e.code]=true;
  if(G.state==='playing'){
    if(e.code==='KeyR')startReload();
    if(e.code==='Digit1')switchWeapon('pistol');if(e.code==='Digit2')switchWeapon('shotgun');
    if(e.code==='Digit3')switchWeapon('rifle');if(e.code==='Digit4')switchWeapon('thuanthien');
    if(e.code==='KeyF'){G.flashOn=!G.flashOn;flashlight.visible=G.flashOn;updateWeaponLabel();}
    if(e.code==='KeyP'||e.code==='Escape')pauseGame();
    if(e.code==='Space'&&G.grounded){G.vy=5.4;G.grounded=false;e.preventDefault();}
  }else if(G.state==='paused'&&e.code==='KeyP')resumeGame();
});
document.addEventListener('keyup',function(e){G.keys[e.code]=false;});
document.addEventListener('mousemove',function(e){if((isLocked()||plFallback)&&G.state==='playing'){G.yaw-=e.movementX*0.0021;G.pitch-=e.movementY*0.0021;G.pitch=Math.max(-1.35,Math.min(1.35,G.pitch));}});
document.addEventListener('mousedown',function(e){if(e.button!==0||G.state!=='playing'||e.target.closest('button'))return;if(!isLocked()&&!document.body.classList.contains('touch')){lockPointer();if(!plFallback)return;}G.mouseDown=true;shoot();});
document.addEventListener('mouseup',function(){G.mouseDown=false;});
document.addEventListener('pointerlockchange',function(){var _now=isLocked();if(_now){plHeld=true;plFallback=false;}else{if(plHeld&&G.state==='playing'&&!document.body.classList.contains('touch'))pauseGame();plHeld=false;}updateLockHint();});

// Mobile
var joyVec={x:0,y:0},lookTouch=null,joyTouch=null,joyEl=document.getElementById('joy'),knob=document.getElementById('joyKnob');
if(('ontouchstart'in window)||navigator.maxTouchPoints>0)document.body.classList.add('touch');
function bindBtn(id,down,up){var el=document.getElementById(id);el.addEventListener('touchstart',function(e){e.preventDefault();down();},{passive:false});if(up)el.addEventListener('touchend',function(e){e.preventDefault();up();},{passive:false});}
bindBtn('btnFire',function(){G.mouseDown=true;shoot();},function(){G.mouseDown=false;});
bindBtn('btnReload',startReload);bindBtn('btnJump',function(){if(G.grounded&&G.state==='playing'){G.vy=5.4;G.grounded=false;}});
bindBtn('btnWeapon',function(){switchWeapon(curWeapon==='pistol'?'shotgun':(curWeapon==='shotgun'?'rifle':(curWeapon==='rifle'?'thuanthien':'pistol')));});
bindBtn('btnFlash',function(){G.flashOn=!G.flashOn;flashlight.visible=G.flashOn;updateWeaponLabel();});
bindBtn('btnPauseM',function(){if(G.state==='playing')pauseGame();else if(G.state==='paused')resumeGame();});
joyEl.addEventListener('touchstart',function(e){e.preventDefault();joyTouch=e.changedTouches[0].identifier;},{passive:false});
document.addEventListener('touchmove',function(e){
  for(var i=0;i<e.changedTouches.length;i++){
    var tc=e.changedTouches[i];
    if(joyTouch===tc.identifier){var r=joyEl.getBoundingClientRect(),dx=tc.clientX-(r.left+r.width/2),dy=tc.clientY-(r.top+r.height/2),d=Math.hypot(dx,dy),max=38;if(d>max){dx*=max/d;dy*=max/d;}knob.style.transform='translate(calc(-50% + '+dx+'px),calc(-50% + '+dy+'px))';joyVec.x=dx/max;joyVec.y=dy/max;}
    if(lookTouch&&tc.identifier===lookTouch.id){G.yaw-=(tc.clientX-lookTouch.x)*0.005;G.pitch-=(tc.clientY-lookTouch.y)*0.005;G.pitch=Math.max(-1.35,Math.min(1.35,G.pitch));lookTouch.x=tc.clientX;lookTouch.y=tc.clientY;}
  }
},{passive:true});
document.addEventListener('touchend',function(e){for(var i=0;i<e.changedTouches.length;i++){var tc=e.changedTouches[i];if(tc.identifier===joyTouch){joyTouch=null;joyVec.x=0;joyVec.y=0;knob.style.transform='translate(-50%,-50%)';}if(lookTouch&&tc.identifier===lookTouch.id)lookTouch=null;}});

// Scare Scheduler
function flashFlicker(dur){var fb=document.getElementById('fadeBlack'),n=0,steps=Math.max(4,Math.floor((dur||0.5)/0.08));var iv=setInterval(function(){fb.style.opacity=(n%2===0)?0.75:0;flashlight.visible=(n%2===0)?false:G.flashOn;if(++n>steps){clearInterval(iv);fb.style.opacity=0;flashlight.visible=G.flashOn;}},80);}
function runScareScheduler(){
  if(Math.random()<0.45){var z=spawnZombie(G.wave>=3&&Math.random()<0.3?'runner':'normal');z.group.position.set(playerPos.x-Math.sin(G.yaw)*6,0,playerPos.z-Math.cos(G.yaw)*6);z.spawnT=0.25;z.graceT=0.75;sfxScream();flashFlicker(0.45);}
  else{sfxWhisper(Math.random()<0.5?-0.9:0.9);if(G.wave>=2&&bigScareCd<=0&&Math.random()<0.25){bigScareCd=95;var f=document.getElementById('faceScare');f.style.display='flex';sfxScream();sfxBassDrop();setTimeout(function(){f.style.display='none';},400);}}
}

// FPS Tracker & Main Loop
var _fpsFrames=0,_fpsWin=performance.now(),_frameNo=0,tmpV=new THREE.Vector3();
function animate(){
  requestAnimationFrame(animate);
  if(document.hidden){clock.getDelta();return;}
  _frameNo++;
  _fpsFrames++;
  var now=performance.now();
  if(now-_fpsWin>=1000){
    var fps=Math.round(_fpsFrames*1000/(now-_fpsWin));
    _fpsFrames=0;_fpsWin=now;window.__fpsAvg=fps;
    _setTxt('qFps','FPS: '+fps);_setTxt('qFpsP','FPS: '+fps);
    if(QMODE==='auto'&&G.state==='playing'){if(fps<42&&QLEVEL<2){QLEVEL++;applyQuality();}else if(fps>57&&QLEVEL>0){QLEVEL--;applyQuality();}}
  }
  var dt=Math.min(clock.getDelta(),0.05),playing=(G.state==='playing');
  if(playing){
    G.time=(now-G.startTime)/1000;
    var run=G.keys['ShiftLeft']||G.keys['ShiftRight'],spd=(run?7.4:4.4)*G.speedMul;
    var fx=-Math.sin(G.yaw),fz=-Math.cos(G.yaw),rx=Math.cos(G.yaw),rz=-Math.sin(G.yaw),mx=0,mz=0;
    if(G.keys['KeyW']){mx+=fx;mz+=fz;}if(G.keys['KeyS']){mx-=fx;mz-=fz;}if(G.keys['KeyA']){mx-=rx;mz-=rz;}if(G.keys['KeyD']){mx+=rx;mz+=rz;}
    mx+=rx*joyVec.x+fx*(-joyVec.y);mz+=rz*joyVec.x+fz*(-joyVec.y);
    var ml=Math.hypot(mx,mz);if(ml>0.01){mx/=Math.max(1,ml);mz/=Math.max(1,ml);playerPos.x+=mx*spd*dt;playerPos.z+=mz*spd*dt;G.bobT+=dt*(run?11:8);}else G.bobT+=dt*2;
    collide(playerPos,0.55);
    G.vy-=14*dt;playerPos.y+=G.vy*dt;if(playerPos.y<=1.7){playerPos.y=1.7;G.vy=0;G.grounded=true;}
    if(G.mouseDown&&WEAPONS[curWeapon].auto)shoot();
    if(G.reloading&&now>=G.reloadEnd)finishReload();
    if(pendingSpawns.length){spawnTimer-=dt;if(spawnTimer<=0){spawnTimer=Math.max(0.35,1.1-G.wave*0.06);spawnZombie(pendingSpawns.shift());}}
    if(waveActive&&!pendingSpawns.length&&zombies.every(function(z){return z.dead;})){waveActive=false;if(G.wave>=10)endGame(true);else setTimeout(function(){if(G.state==='playing')showUpgrades();},900);}
    if((_frameNo%12)===0)checkZone();
    groanTimer-=dt;if(groanTimer<=0){groanTimer=3+Math.random()*4;if(zombies.some(function(z){return !z.dead;}))sfxGroan();}
    scareTimer-=dt;bigScareCd=Math.max(0,bigScareCd-dt);if(scareTimer<=0){scareTimer=45+Math.random()*25;runScareScheduler();}
    for(var i=pickups.length-1;i>=0;i--){
      var pk=pickups[i];pk.t+=dt*3;pk.g.position.y=Math.sin(pk.t)*0.06;pk.g.rotation.y+=dt*1.5;
      if(Math.hypot(pk.g.position.x-playerPos.x,pk.g.position.z-playerPos.z)<1.3){
        if(pk.kind==='med'&&G.hp<G.maxHp){heal(35);sfxPickup();announce('',t('pickHeal'));scene.remove(pk.g);pickups.splice(i,1);}
        else if(pk.kind==='ammo'){wState.shotgun.reserve=Math.min(36,wState.shotgun.reserve+12);wState.rifle.reserve=Math.min(150,wState.rifle.reserve+60);sfxPickup();announce('',t('pickAmmo'));scene.remove(pk.g);pickups.splice(i,1);updateHUD();}
      }
    }
  }
  for(var ni=notes.length-1;ni>=0;ni--){var nt=notes[ni];nt.t+=dt*2.4;nt.g.position.y=Math.sin(nt.t)*0.07;nt.ring.rotation.z+=dt*1.2;if(playing&&Math.hypot(nt.g.position.x-playerPos.x,nt.g.position.z-playerPos.z)<1.4)collectNote(nt);}
  if((_frameNo%2)===0){
    if(dustPts.visible){dustPts.rotation.y+=dt*0.015;}
    if(rainPts.visible){rainPts.position.y-=dt*3.2;if(rainPts.position.y<-3)rainPts.position.y=0;}
    streetLights.forEach(function(sl){sl.halo.lookAt(camera.position);});
  }
  // Zombies update
  for(var zi=zombies.length-1;zi>=0;zi--){
    var z=zombies[zi],gp=z.group.position;
    if(z.dead){
      z.deathT+=dt;z.barG.visible=false;
      var mf=Math.min(1,z.deathT*2.4);z.group.rotation.x=-Math.PI/2*mf*mf;
      if(z.deathT>0.65)z.group.position.y-=dt*1.4;
      if(z.deathT>1.25){scene.remove(z.group);zombies.splice(zi,1);var pt=zombiePool[z.type]||(zombiePool[z.type]=[]);if(pt.length<12)pt.push(z);}
      continue;
    }
    if(z.flashT>0){z.flashT-=dt;if(z.flashT<=0)setZombieFlash(z,false);}
    if(!playing)continue;
    var dx=playerPos.x-gp.x,dz2=playerPos.z-gp.z,dist=Math.hypot(dx,dz2)||0.01;
    if(z.spawnT<=0&&dist>1.25*z.group.scale.x*0.8){gp.x+=dx/dist*z.speed*dt;gp.z+=dz2/dist*z.speed*dt;collide(gp,0.5*z.group.scale.x);}
    z.group.rotation.y=Math.atan2(dx,dz2);
    if(z.model)zombieModelAnim(z,dt,dist);
    else if(z.spawnT>0){z.spawnT-=dt;z.group.position.y=-2.1*z.group.scale.y*Math.max(0,z.spawnT/1.4);}
    z.barG.lookAt(camera.position);
    z.barFg.scale.x=Math.max(0,z.hp/z.maxHp);
    if(z.graceT>0)z.graceT-=dt;if(z.atkCd>0)z.atkCd-=dt;
    if(z.spawnT<=0&&z.graceT<=0&&dist<1.45*z.group.scale.x&&z.atkCd<=0){z.atkCd=0.85;z.atkT=0.32;hurtPlayer(z.dmg,gp.x,gp.z);}
    if(z.isBoss&&bossRef===z){document.getElementById('bossWrap').classList.remove('hidden');document.getElementById('bossBar').style.width=Math.max(0,z.hp/z.maxHp*100)+'%';}
  }
  // FX pools update
  for(var ti=tracers.length-1;ti>=0;ti--){var tr=tracers[ti];tr.t-=dt;tr.l.material.opacity=Math.max(0,tr.t/0.09)*0.85;if(tr.t<=0){tr.active=false;tr.l.visible=false;tracers.splice(ti,1);}}
  for(var pi=particles.length-1;pi>=0;pi--){var pp=particles[pi];pp.t-=dt;pp.vy-=6*dt;pp.m.position.x+=pp.vx*dt;pp.m.position.y+=pp.vy*dt;pp.m.position.z+=pp.vz*dt;if(pp.t<=0){pp.active=false;pp.m.visible=false;particles.splice(pi,1);}}
  for(var ci=casingsLive.length-1;ci>=0;ci--){var cc=casingsLive[ci];cc.t-=dt;cc.vy-=9*dt;cc.m.position.x+=cc.vx*dt;cc.m.position.y+=cc.vy*dt;cc.m.position.z+=cc.vz*dt;cc.m.rotation.x+=cc.rx*dt;if(cc.t<=0){cc.active=false;cc.m.visible=false;casingsLive.splice(ci,1);}}
  for(var di=0;di<dmgPool.length;di++){var dp=dmgPool[di];if(dp.t>0){dp.t-=dt;dp.wp.y+=dt*0.9;tmpV.copy(dp.wp).project(camera);if(tmpV.z<1){dp.el.style.left=((tmpV.x*0.5+0.5)*innerWidth)+'px';dp.el.style.top=((-tmpV.y*0.5+0.5)*innerHeight)+'px';dp.el.style.opacity=Math.min(1,dp.t*2);}else dp.el.style.display='none';if(dp.t<=0)dp.el.style.display='none';}}

  // Camera + Gun feel
  G.shake=Math.max(0,G.shake-dt*1.8);
  camera.position.copy(playerPos);
  if(G.shake>0){camera.position.x+=(Math.random()-0.5)*G.shake*0.18;camera.position.y+=(Math.random()-0.5)*G.shake*0.18;}
  var _dyw=G.yaw-lastYaw,_dpt=G.pitch-lastPitch;lastYaw=G.yaw;lastPitch=G.pitch;
  swayX+=((Math.max(-0.045,Math.min(0.045,-_dyw*0.55)))-swayX)*Math.min(1,dt*9);
  swayY+=((Math.max(-0.03,Math.min(0.03,_dpt*0.5)))-swayY)*Math.min(1,dt*9);
  camera.rotation.order='YXZ';camera.rotation.y=G.yaw;camera.rotation.x=G.pitch;
  if(G.reloading&&G.reloadDur)gunDip=Math.sin(Math.min(1,Math.max(0,1-(G.reloadEnd-now)/G.reloadDur))*Math.PI);else gunDip+=(0-gunDip)*Math.min(1,dt*10);
  if(switchT>0)switchT-=dt;
  var totalDip=gunDip*0.22+(switchT>0?Math.sin((0.38-Math.max(0,switchT))/0.38*Math.PI)*0.3:0);
  if(swordSwingT>0)swordSwingT=Math.max(0,swordSwingT-dt);
  var _swAng=swordSwingT>0?Math.sin((0.32-swordSwingT)/0.32*Math.PI):0;
  gunGroup.position.x=gunBase.x+Math.sin(G.bobT)*0.01+swayX-_swAng*0.26;
  gunGroup.position.y=gunBase.y+Math.abs(Math.sin(G.bobT))*0.01-totalDip+_swAng*0.08;
  gunGroup.rotation.x=gunDip*0.55+swayY-_swAng*1.15;gunGroup.rotation.y=swayX*1.5+_swAng*0.65;gunGroup.rotation.z=gunDip*0.38+_swAng*0.75;
  gunGroup.position.z+=(-0.62-gunGroup.position.z)*Math.min(1,dt*14);
  if(gunParts.flash&&gunParts.flash.material.opacity>0)gunParts.flash.material.opacity=Math.max(0,gunParts.flash.material.opacity-dt*9);
  muzzleLight.intensity=Math.max(0,muzzleLight.intensity-dt*520);

  renderer.render(scene,camera);
  gunCam.fov=camera.fov;if(gunCam.aspect!==camera.aspect)gunCam.aspect=camera.aspect;gunCam.updateProjectionMatrix();
  gunMuzzle.intensity=muzzleLight.intensity;gunMuzzle.position.set(gunGroup.position.x,gunGroup.position.y+0.04,gunGroup.position.z+(gunParts.muzzleZ||-0.45));
  renderer.autoClear=false;renderer.clearDepth();renderer.render(gunScene,gunCam);renderer.autoClear=true;
}

addEventListener('resize',function(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
applyLang();updateHUD();syncBackendUI();loadAllWorldGLBs();animate();
