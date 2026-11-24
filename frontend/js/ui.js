"use strict";
var _hudCache={},visitedZones={},curZone='',zoneTimer=null,annTimer=null;
function _setTxt(id,v){if(_hudCache[id]!==v){_hudCache[id]=v;var el=document.getElementById(id);if(el)el.textContent=v;}}
function fmtTime(s){var m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss;}

function updateHUD(){
  _setTxt('hWave',String(Math.max(1,G.wave)));
  var _alive=0;for(var i=0;i<zombies.length;i++)if(!zombies[i].dead)_alive++;
  _setTxt('hLeft',String(pendingSpawns.length+_alive));
  _setTxt('hScore',String(G.score));
  _setTxt('hKills',String(G.kills));
  var _hpw=Math.max(0,G.hp/G.maxHp*100)+'%';
  if(_hudCache.hpw!==_hpw){_hudCache.hpw=_hpw;document.getElementById('hpBar').style.width=_hpw;}
  _setTxt('hpText','HP '+Math.ceil(G.hp)+' / '+G.maxHp);
  var _stw=Math.max(0,Math.min(100,G.stamina!==undefined?G.stamina:100)).toFixed(1)+'%';
  if(_hudCache.stw!==_stw){_hudCache.stw=_stw;var sb=document.getElementById('stamBar');if(sb)sb.style.width=_stw;}
  var _stl=!!G.stamLock;
  if(_hudCache.stl!==_stl){_hudCache.stl=_stl;var sw=document.getElementById('stamWrap');if(sw)sw.classList.toggle('locked',_stl);}
  var _fcd=(G.flareCd||0)>0;
  var _flTxt=_fcd?('🔥 '+G.flareCd.toFixed(1)+'s'):t('flareReady');
  if(_hudCache.flTxt!==_flTxt){_hudCache.flTxt=_flTxt;var fc=document.getElementById('flareChip');if(fc)fc.textContent=_flTxt;}
  if(_hudCache.flCd!==_fcd){_hudCache.flCd=_fcd;var fc2=document.getElementById('flareChip');if(fc2)fc2.classList.toggle('cd',_fcd);}
  var st=wState[curWeapon],W=WEAPONS[curWeapon];
  var _am=W.melee?'⚔ <small>∞</small>':(st.mag+' <small>/ '+(st.reserve===Infinity?'∞':st.reserve)+'</small>');
  if(_hudCache.am!==_am){_hudCache.am=_am;document.getElementById('ammo').innerHTML=_am;}
  var _rh=W.melee?'':(G.reloading?t('reloading'):(st.mag<=Math.ceil(W.mag*0.25)&&st.reserve>0?t('lowAmmo'):''));
  if(_hudCache.rh!==_rh){_hudCache.rh=_rh;document.getElementById('reloadHint').textContent=_rh;}
  updateWeaponLabel();
  var _vg=G.hp<G.maxHp*0.4?0.55:0;
  if(_hudCache.vg!==_vg){_hudCache.vg=_vg;document.getElementById('vignette').style.opacity=_vg;}
  _setTxt('radarZone',t(curZone||zoneKeyFor(playerPos.x,playerPos.z)));
}
function updateReloadBar(now){
  var show=G.state==='playing'&&!!G.reloading&&!!G.reloadDur;
  if(_hudCache.rlShow!==show){_hudCache.rlShow=show;var w=document.getElementById('reloadBarWrap');if(w)w.classList.toggle('hidden',!show);}
  if(show){
    var pct=Math.max(0,Math.min(100,(1-(G.reloadEnd-now)/G.reloadDur)*100)).toFixed(1)+'%';
    if(_hudCache.rlPct!==pct){_hudCache.rlPct=pct;var f=document.getElementById('reloadBarFill');if(f)f.style.width=pct;}
  }else if(_hudCache.rlPct!=='0%'){_hudCache.rlPct='0%';var f2=document.getElementById('reloadBarFill');if(f2)f2.style.width='0%';}
}
function updateCrosshair(){
  var sc=(1+(G.xhairKick||0)*0.55).toFixed(3);
  if(_hudCache.xh!==sc){_hudCache.xh=sc;var el=document.getElementById('crosshair');if(el)el.style.transform='translate(-50%,-50%) scale('+sc+')';}
}
function updateWeaponLabel(){var v=WEAPONS[curWeapon].name+(G.flashOn?' · 🔦':'');if(_hudCache.wn!==v){_hudCache.wn=v;var el=document.getElementById('wname');if(el)el.textContent=v;}}

function applyLang(){
  document.querySelectorAll('[data-i]').forEach(function(el){var k=el.getAttribute('data-i');if(T[LANG][k])el.textContent=T[LANG][k];});
  document.getElementById('langVi').classList.toggle('on',LANG==='vi');
  document.getElementById('langEn').classList.toggle('on',LANG==='en');
  _hudCache.flTxt=null;_hudCache.rh=null;_hudCache.radarZone=null;
  updateWeaponLabel();
  if(typeof updateHUD==='function')updateHUD();
  if(typeof updateLockHint==='function')updateLockHint();
}
document.getElementById('langVi').onclick=function(){LANG='vi';applyLang();FPSApi.saveProfile({lang:'vi'});};
document.getElementById('langEn').onclick=function(){LANG='en';applyLang();FPSApi.saveProfile({lang:'en'});};

function announce(big,sub){
  var a=document.getElementById('announce');
  document.getElementById('annBig').textContent=big;
  document.getElementById('annSub').textContent=sub||'';
  a.style.opacity=1;clearTimeout(annTimer);annTimer=setTimeout(function(){a.style.opacity=0;},2400);
}
function zoneKeyFor(x,z){
  if(z<-76)return 'zRidge';if(z<-26)return 'zChurch';
  if(z>76)return 'zRiver';if(z>26)return 'zGraveyard';
  if(x>76)return 'zFarm';if(x>26)return 'zMarket';
  if(x<-76)return 'zShrine';if(x<-26)return 'zForest';
  return 'zCross';
}
function drawFpsRadar(){
  var c=document.getElementById('fpsRadar');if(!c)return;
  var ctx=c.getContext('2d'),w=c.width,h=c.height,cx=w/2,cy=h/2,R=cx-9,range=85;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='rgba(8,12,10,0.86)';ctx.beginPath();ctx.arc(cx,cy,R+6,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(160,180,150,0.32)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='rgba(160,180,150,0.18)';ctx.beginPath();ctx.arc(cx,cy,R*0.5,0,Math.PI*2);ctx.stroke();
  var sy=Math.sin(G.yaw),co=Math.cos(G.yaw);
  function toRadar(wx,wz){
    var dx=wx-playerPos.x,dz=wz-playerPos.z;
    var rx=dx*co-dz*sy,rz=dx*sy+dz*co;
    var px=cx+(rx/range)*R,py=cy+(rz/range)*R;
    var d=Math.hypot(px-cx,py-cy);
    if(d>R-3){px=cx+(px-cx)/d*(R-3);py=cy+(py-cy)/d*(R-3);}
    return [px,py];
  }
  function plot(wx,wz,col,sz){
    var pt=toRadar(wx,wz);
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(pt[0],pt[1],sz,0,Math.PI*2);ctx.fill();
  }
  if(typeof fireZones!=='undefined'){
    for(var fi=0;fi<fireZones.length;fi++){if(!fireZones[fi].active)continue;var fp=toRadar(fireZones[fi].x,fireZones[fi].z);ctx.strokeStyle='rgba(255,145,45,0.85)';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(fp[0],fp[1],3.4,0,Math.PI*2);ctx.stroke();}
  }
  if(typeof supplies!=='undefined'){
    for(var si=0;si<supplies.length;si++){
      if(supplies[si].cd>0)continue;
      var sp=toRadar(supplies[si].x,supplies[si].z);
      ctx.fillStyle='#081a0e';ctx.fillRect(sp[0]-3.8,sp[1]-3.8,7.6,7.6);
      ctx.fillStyle='#3eff8b';ctx.fillRect(sp[0]-2.8,sp[1]-2.8,5.6,5.6);
    }
  }
  for(var ni=0;ni<notes.length;ni++)plot(notes[ni].g.position.x,notes[ni].g.position.z,'#ffd45a',2.8);
  for(var zi=0;zi<zombies.length;zi++){var z=zombies[zi];if(!z.dead)plot(z.group.position.x,z.group.position.z,z.isBoss?'#ff3020':'rgba(255,95,85,0.9)',z.isBoss?3.6:2.0);}
  // Rotated N compass indicator around radar perimeter
  var nx=cx+sy*(R+1),ny=cy-co*(R+1);
  ctx.fillStyle='rgba(10,14,12,0.94)';ctx.beginPath();ctx.arc(nx,ny,7,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ffd45a';ctx.lineWidth=1.1;ctx.stroke();
  ctx.fillStyle='#ffd45a';ctx.font='bold 10px Consolas,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('N',nx,ny+0.5);
  ctx.fillStyle='#ffffff';ctx.beginPath();ctx.moveTo(cx,cy-4.5);ctx.lineTo(cx-3.2,cy+3.5);ctx.lineTo(cx+3.2,cy+3.5);ctx.closePath();ctx.fill();
}
function checkZone(){
  if(G.state!=='playing')return;
  var k=zoneKeyFor(playerPos.x,playerPos.z);if(k===curZone)return;
  curZone=k;_setTxt('radarZone',t(k));
  if(visitedZones[k])return;visitedZones[k]=true;
  var b=document.getElementById('zoneBanner');document.getElementById('zbName').textContent=t(k);
  b.style.opacity=1;clearTimeout(zoneTimer);zoneTimer=setTimeout(function(){b.style.opacity=0;},2200);
}

var UPGRADES=[
  function(){G.dmgMul*=1.2;},function(){G.rateMul*=1.15;},function(){G.maxHp+=25;heal(50);},function(){G.speedMul*=1.12;},
  function(){wState.shotgun.reserve=WEAPONS.shotgun.reserve;wState.rifle.reserve=WEAPONS.rifle.reserve;},
  function(){G.reloadMul*=0.75;},function(){G.armor=Math.min(0.45,G.armor+0.15);}
];
function showUpgrades(){
  G.state='upgrade';document.body.classList.remove('playing');
  if(document.exitPointerLock)document.exitPointerLock();
  updateLockHint();
  var idx=[];while(idx.length<3){var r=Math.floor(Math.random()*UPGRADES.length);if(idx.indexOf(r)<0)idx.push(r);}
  var wrap=document.getElementById('upCards');wrap.innerHTML='';
  var icons=['✸','»','✚','➤','▣','↻','⛨'];
  idx.forEach(function(u){
    var c=document.createElement('button');c.className='upcard';
    c.innerHTML='<div class="ic">'+icons[u]+'</div><h3>'+t('ups')[u].n+'</h3><p>'+t('ups')[u].d+'</p>';
    c.onclick=function(){UPGRADES[u]();document.getElementById('upgradeScr').classList.add('hidden');G.state='playing';document.body.classList.add('playing');lockPointer();startWave(G.wave+1);};
    wrap.appendChild(c);
  });
  var _us=document.getElementById('upStory'),_sk='story'+G.wave;
  if(T[LANG][_sk]){_us.textContent=T[LANG][_sk];_us.style.display='block';}else{_us.style.display='none';}
  document.getElementById('upgradeScr').classList.remove('hidden');updateHUD();
}

async function syncBackendUI(){
  var prof=await FPSApi.loadProfile();
  var lb=await FPSApi.loadLeaderboard();
  if(prof&&prof.lang){LANG=prof.lang;applyLang();}
  var el=document.getElementById('lbBox');
  if(el){
    var top=lb&&lb[0]?('Top #1: '+lb[0].name+' ('+lb[0].score+' pts, W'+lb[0].wave+')'):'No runs recorded yet';
    var best=prof&&prof.bestScore?('Best: '+prof.bestScore+' pts (W'+(prof.bestWave||1)+')'):'First run';
    el.innerHTML='<span>'+best+'</span><span>'+top+'</span>';
  }
}
