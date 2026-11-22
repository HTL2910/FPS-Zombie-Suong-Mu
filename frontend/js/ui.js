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
  var st=wState[curWeapon],W=WEAPONS[curWeapon];
  var _am=W.melee?'⚔ <small>∞</small>':(st.mag+' <small>/ '+(st.reserve===Infinity?'∞':st.reserve)+'</small>');
  if(_hudCache.am!==_am){_hudCache.am=_am;document.getElementById('ammo').innerHTML=_am;}
  document.getElementById('reloadHint').textContent=W.melee?'':(G.reloading?t('reloading'):(st.mag<=Math.ceil(W.mag*0.25)&&st.reserve>0?t('lowAmmo'):''));
  updateWeaponLabel();
  document.getElementById('vignette').style.opacity=G.hp<G.maxHp*0.4?0.55:0;
}
function updateWeaponLabel(){var el=document.getElementById('wname');if(el)el.textContent=WEAPONS[curWeapon].name+(G.flashOn?' · 🔦':'');}

function applyLang(){
  document.querySelectorAll('[data-i]').forEach(function(el){var k=el.getAttribute('data-i');if(T[LANG][k])el.textContent=T[LANG][k];});
  document.getElementById('langVi').classList.toggle('on',LANG==='vi');
  document.getElementById('langEn').classList.toggle('on',LANG==='en');
  updateWeaponLabel();
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
function zoneKeyFor(x,z){if(z<-24)return 'zChurch';if(z>24)return 'zGraveyard';if(x>24)return 'zMarket';if(x<-24)return 'zForest';return 'zCross';}
function checkZone(){
  if(G.state!=='playing')return;
  var k=zoneKeyFor(playerPos.x,playerPos.z);if(k===curZone)return;
  curZone=k;if(visitedZones[k])return;visitedZones[k]=true;
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
