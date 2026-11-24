"use strict";
window.FPS = window.FPS || {};

FPS.ui = (function () {
  var _cache = {};
  var _elCache = {};
  var _annTimer = null;
  var _toastTimer = null;
  var _hitTimer = null;
  var _dmgDirTimer = null;
  var _projV = null;
  var _viewV = null;
  var _lastSelect = { profile: null, selectedLevelId: 1, onPickLevel: null };
  var _radarWallCanvas = null;
  var _radarWallLvId = null;
  var _radarWallScale = 0;
  var _radarWallCount = -1;
  var _radarWallSize = 0;

  function _el(id) {
    var e = _elCache[id];
    if (!e || !e.isConnected) {
      e = document.getElementById(id);
      _elCache[id] = e;
    }
    return e;
  }

  function _setTxt(id, v) {
    if (_cache[id] !== v) {
      _cache[id] = v;
      var el = _el(id);
      if (el) el.textContent = v;
    }
  }

  function _setStyle(id, prop, val) {
    var k = id + ":" + prop;
    if (_cache[k] !== val) {
      _cache[k] = val;
      var el = _el(id);
      if (el) el.style[prop] = val;
    }
  }

  function _toggleCls(id, cls, on) {
    var k = id + "." + cls;
    var b = !!on;
    if (_cache[k] !== b) {
      _cache[k] = b;
      var el = _el(id);
      if (el) el.classList.toggle(cls, b);
    }
  }

  function _toggleHidden(id, hide) {
    _toggleCls(id, "hidden", hide);
  }

  function fmtTime(s) {
    var sec = Math.max(0, Number(s) || 0);
    var m = Math.floor(sec / 60);
    var ss = Math.floor(sec % 60);
    return m + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function _t(key, fbVi, fbEn) {
    var L = FPS.LANG || "vi";
    if (FPS.T && FPS.T[L] && FPS.T[L][key]) return FPS.T[L][key];
    if (typeof FPS.t === "function") {
      var res = FPS.t(key);
      if (res && res !== key) return res;
    }
    return L === "en" ? (fbEn || fbVi || key) : (fbVi || key);
  }

  function _resolveState(st) {
    var s = st || {};
    var fs = FPS.state || {};
    var fw = FPS.world || {};
    var fe = FPS.entities || {};
    var G = s.G || (s.state !== undefined && s.hp !== undefined ? s : null) || fs.G || {};
    var playerPos = s.playerPos || fs.playerPos || null;
    var level = s.level || fw.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx || 0]) || null;
    var curWeapon = s.curWeapon || fe.curWeapon || "pistol";
    var wState = s.wState || fe.wState || null;
    var bossRef = s.bossRef !== undefined ? s.bossRef : (fe.bossRef !== undefined ? fe.bossRef : null);
    var zombies = s.zombies || fe.zombies || [];
    var barrels = s.barrels || fw.explosiveBarrels || [];
    var supplies = s.supplies || fw.supplyNodes || [];
    var fireZones = s.fireZones || fe.fireZones || [];
    var camera = s.camera || fw.camera || null;
    return {
      G: G,
      playerPos: playerPos,
      level: level,
      curWeapon: curWeapon,
      wState: wState,
      bossRef: bossRef,
      zombies: zombies,
      barrels: barrels,
      supplies: supplies,
      fireZones: fireZones,
      camera: camera
    };
  }

  function updateWeaponLabel(curWeapon, G) {
    var fe = FPS.entities || {};
    var g = G || (FPS.state && FPS.state.G) || {};
    var wk = curWeapon || fe.curWeapon || "pistol";
    var W = FPS.WEAPONS && FPS.WEAPONS[wk];
    if (!W) return;
    _setTxt("wname", W.name + (g.flashOn ? " · 🔦" : ""));
  }

  function updateReloadBar(now, G) {
    var g = G || (FPS.state && FPS.state.G) || {};
    var show = g.state === "playing" && !!g.reloading && !!g.reloadDur;
    _toggleHidden("reloadBarWrap", !show);
    if (show) {
      var tNow = now !== undefined ? now : performance.now();
      var pct = Math.max(0, Math.min(100, (1 - (g.reloadEnd - tNow) / g.reloadDur) * 100)).toFixed(1) + "%";
      _setStyle("reloadBarFill", "width", pct);
    } else {
      _setStyle("reloadBarFill", "width", "0%");
    }
  }

  function updateCrosshair(G) {
    var g = G || (FPS.state && FPS.state.G) || {};
    var sc = (1 + (g.xhairKick || 0) * 0.55).toFixed(3);
    _setStyle("crosshair", "transform", "translate(-50%,-50%) scale(" + sc + ")");
  }

  var _lastPlFallback = false;
  function updateLockHint(plFallback) {
    if (plFallback !== undefined) _lastPlFallback = !!plFallback;
    var h = document.getElementById("lockHint");
    if (!h) return;
    var g = (FPS.state && FPS.state.G) || {};
    var camEl = FPS.world && FPS.world.renderer && FPS.world.renderer.domElement;
    var locked = !!(camEl && document.pointerLockElement === camEl);
    var show = g.state === "playing" && !document.body.classList.contains("touch") && !locked;
    _toggleHidden("lockHint", !show);
    var txt = _lastPlFallback ? _t("lockHintFb", "🖱 Khung nhúng này chặn khóa chuột — cứ di chuột để ngắm, click để bắn", "🖱 Embedded frame blocks mouse lock — move to aim, click to shoot")
                         : _t("lockHint", "🖱 Click vào màn hình để khóa chuột — di chuột để ngắm · Esc để thả chuột", "🖱 Click the screen to lock your mouse — move to aim · Esc to release");
    _setTxt("lockHint", txt);
  }

  function setQualityBadge(text) {
    _setTxt("qBadge", text);
  }

  function renderLevelSelect(profile, selectedLevelId, onPickLevel) {
    var prof = profile || _lastSelect.profile || { highestLevel: 1 };
    var highest = Math.max(1, Number(prof.highestLevel) || 1);
    var levels = FPS.LEVELS || [];
    var sel = Number(selectedLevelId || _lastSelect.selectedLevelId) || 1;
    if (sel > highest) sel = 1;
    if (sel < 1) sel = 1;
    var cb = typeof onPickLevel === "function" ? onPickLevel : _lastSelect.onPickLevel;
    _lastSelect = { profile: prof, selectedLevelId: sel, onPickLevel: cb };

    var grid = document.getElementById("levelGrid");
    if (!grid) return;
    grid.innerHTML = "";

    var L = FPS.LANG || "vi";
    var stagePrefix = _t("level", "Màn", "Stage");
    var unlockWord = _t("unlockReq", "Mở khóa Màn", "Unlock Stage");
    var bossLabel = _t("bossTag", "BOSS", "BOSS");
    var extractLabel = _t("noBossTag", "THOÁT HIỂM", "EXTRACTION");

    for (var i = 0; i < levels.length; i++) {
      (function (lvl) {
        var unlocked = lvl.id <= highest;
        var isSel = unlocked && lvl.id === sel;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lvlCard" + (isSel ? " selected" : "") + (unlocked ? "" : " locked");
        btn.dataset.levelId = String(lvl.id);
        if (!unlocked) btn.disabled = true;

        var top = document.createElement("div");
        top.className = "lvlTop";
        var numSpan = document.createElement("span");
        numSpan.className = "lvlNum";
        numSpan.textContent = stagePrefix.toUpperCase() + " " + (lvl.id < 10 ? "0" + lvl.id : lvl.id);
        top.appendChild(numSpan);

        var badge = document.createElement("span");
        if (lvl.bossType) {
          badge.className = "lvlBoss";
          badge.textContent = "☠ " + bossLabel;
        } else {
          badge.textContent = "🌀 " + extractLabel;
        }
        top.appendChild(badge);
        btn.appendChild(top);

        var nameEl = document.createElement("div");
        nameEl.className = "lvlName";
        nameEl.textContent = L === "en" ? (lvl.nameEn || lvl.nameVi) : (lvl.nameVi || lvl.nameEn);
        btn.appendChild(nameEl);

        var foot = document.createElement("div");
        foot.className = "lvlFoot";
        var qSpan = document.createElement("span");
        qSpan.className = "lvlQuota";
        qSpan.textContent = "💀 " + lvl.killQuota;
        foot.appendChild(qSpan);

        var stSpan = document.createElement("span");
        if (!unlocked) {
          stSpan.className = "lvlLock";
          stSpan.textContent = "🔒 " + unlockWord + " " + (lvl.id - 1);
        } else if (isSel) {
          stSpan.className = "lvlSelTag";
          stSpan.textContent = L === "en" ? "▶ SELECTED" : "▶ ĐÃ CHỌN";
        } else {
          stSpan.textContent = L === "en" ? "READY" : "SẴN SÀNG";
        }
        foot.appendChild(stSpan);
        btn.appendChild(foot);

        if (unlocked) {
          btn.onclick = function () {
            _lastSelect.selectedLevelId = lvl.id;
            var cards = grid.querySelectorAll(".lvlCard");
            for (var j = 0; j < cards.length; j++) {
              var c = cards[j];
              var cId = Number(c.dataset.levelId);
              var cSel = cId === lvl.id;
              c.classList.toggle("selected", cSel);
              var tag = c.querySelector(".lvlFoot span:last-child");
              if (tag && !c.classList.contains("locked")) {
                tag.className = cSel ? "lvlSelTag" : "";
                tag.textContent = cSel ? (L === "en" ? "▶ SELECTED" : "▶ ĐÃ CHỌN") : (L === "en" ? "READY" : "SẴN SÀNG");
              }
            }
            if (typeof cb === "function") cb(lvl.id);
          };
        }
        grid.appendChild(btn);
      })(levels[i]);
    }
  }

  function applyLang(lang) {
    if (lang === "vi" || lang === "en") FPS.LANG = lang;
    var L = FPS.LANG || "vi";
    if (document.documentElement) document.documentElement.lang = L;
    var dict = (FPS.T && FPS.T[L]) || {};
    var nodes = document.querySelectorAll("[data-i]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var k = el.getAttribute("data-i");
      if (dict[k]) el.textContent = dict[k];
    }
    var bVi = document.getElementById("langVi");
    var bEn = document.getElementById("langEn");
    if (bVi) bVi.classList.toggle("on", L === "vi");
    if (bEn) bEn.classList.toggle("on", L === "en");

    // Invalidate localized HUD text caches
    _cache.flareChip = null;
    _cache.reloadHint = null;
    _cache.wname = null;
    _cache.missionTitle = null;
    _cache.missionQuota = null;
    _cache.extractBarTxt = null;
    _cache.radarZone = null;
    _cache.lockHint = null;

    if (FPS.LEVELS && document.getElementById("levelGrid")) {
      renderLevelSelect(_lastSelect.profile, _lastSelect.selectedLevelId, _lastSelect.onPickLevel);
    }
    updateWeaponLabel();
    updateHUD();
    updateLockHint();
  }

  function updateHUD(state) {
    var s = _resolveState(state);
    var G = s.G;
    var level = s.level;
    var L = FPS.LANG || "vi";

    _setTxt("hLevel", String((G.levelIdx !== undefined ? G.levelIdx : 0) + 1));
    _setTxt("hScore", String(Math.floor(G.score || 0)));
    _setTxt("hKills", String(G.totalKills !== undefined ? G.totalKills : (G.kills || 0)));
    _setTxt("hBarrels", String(G.barrelsPopped || 0));

    // Mission box
    var lvName = level ? (L === "en" ? (level.nameEn || level.nameVi) : (level.nameVi || level.nameEn)) : "";
    _setTxt("missionTitle", lvName);
    var kills = G.levelKills || 0;
    var quota = G.killQuota || (level && level.killQuota) || 1;
    var unlocked = !!G.portalUnlocked;
    _toggleCls("missionBox", "unlocked", unlocked);

    if (unlocked) {
      _setTxt("missionQuota", "🌀 " + _t("objExtractReady", "CỔNG ĐÃ MỞ — CHẠY TỚI ĐIỂM THOÁT!", "PORTAL OPEN — REACH EXTRACTION!"));
      _setStyle("missionBar", "width", "100%");
    } else {
      var qStr = "💀 " + _t("objKill", "Tiêu diệt", "Eliminate") + ": " + Math.min(kills, quota) + " / " + quota;
      if (kills >= quota && level && level.bossType) {
        qStr += " · ☠ " + _t("bossTag", "BOSS", "BOSS");
      }
      _setTxt("missionQuota", qStr);
      var pct = Math.max(0, Math.min(100, Math.round((kills / Math.max(1, quota)) * 100)));
      _setStyle("missionBar", "width", pct + "%");
    }

    // Extraction hold progress bar
    var holdSec = (level && level.extractHoldSec) || 2.5;
    var prog = G.extractProg || 0;
    var showExBar = G.state === "playing" && unlocked && prog > 0.01;
    _toggleHidden("extractBarWrap", !showExBar);
    if (showExBar) {
      var exPct = Math.max(0, Math.min(100, Math.round((prog / holdSec) * 100)));
      _setStyle("extractBarFill", "width", exPct + "%");
      _setTxt("extractBarTxt", _t("objHolding", "ĐANG THOÁT HIỂM...", "EXTRACTING...") + " " + exPct + "%");
    }

    // Boss bar
    var boss = s.bossRef;
    var showBoss = !!(G.state === "playing" && boss && !boss.dead);
    _toggleHidden("bossWrap", !showBoss);
    if (showBoss) {
      var bType = boss.key || (level && level.bossType) || "";
      var bKey = bType === "minotaur" ? "bossNameMino" : (bType === "orcking" ? "bossNameOrc" : "bossName");
      _setTxt("bossName", boss.name || _t(bKey, "☠ BOSS ☠", "☠ BOSS ☠"));
      _setStyle("bossBar", "width", Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.maxHp)) * 100)).toFixed(1) + "%");
    }

    // HP & Stamina
    var maxHp = Math.max(1, G.maxHp || 100);
    var hpNow = Math.max(0, G.hp !== undefined ? G.hp : maxHp);
    _setStyle("hpBar", "width", Math.max(0, Math.min(100, hpNow / maxHp * 100)).toFixed(1) + "%");
    _setTxt("hpText", "HP " + Math.ceil(hpNow) + " / " + maxHp);

    var stamVal = G.stamina !== undefined ? G.stamina : 100;
    _setStyle("stamBar", "width", Math.max(0, Math.min(100, stamVal)).toFixed(1) + "%");
    _toggleCls("stamWrap", "locked", !!(G.stamLocked || G.stamLock));

    // Low HP vignette + pulse
    _setStyle("vignette", "opacity", hpNow < maxHp * 0.4 ? "0.55" : "0");
    var isLow = G.state === "playing" && hpNow > 0 && hpNow < maxHp * 0.3;
    if (_cache.lowHp !== isLow) {
      _cache.lowHp = isLow;
      document.body.classList.toggle("lowhp", isLow);
    }

    // Flare cooldown
    var fcd = (G.flareCd || 0) > 0;
    var flTxt = fcd ? ("🔥 " + G.flareCd.toFixed(1) + "s") : _t("flareReady", "🔥 G: Sẵn Sàng", "🔥 G: Ready");
    _setTxt("flareChip", flTxt);
    _toggleCls("flareChip", "cd", fcd);

    // Weapon & Ammo
    updateWeaponLabel(s.curWeapon, G);
    var W = FPS.WEAPONS && FPS.WEAPONS[s.curWeapon];
    var wst = s.wState && s.wState[s.curWeapon];
    if (W && wst) {
      var amHtml = W.melee ? "⚔ <small>∞</small>" : (wst.mag + " <small>/ " + (wst.reserve === Infinity ? "∞" : wst.reserve) + "</small>");
      if (_cache.amHtml !== amHtml) {
        _cache.amHtml = amHtml;
        var amEl = document.getElementById("ammo");
        if (amEl) amEl.innerHTML = amHtml;
      }
      var rh = W.melee ? "" : (G.reloading ? _t("reloading", "ĐANG NẠP…", "RELOADING…") : (wst.mag <= Math.ceil(W.mag * 0.25) && wst.reserve > 0 ? _t("lowAmmo", "SẮP HẾT ĐẠN — NHẤN R", "LOW AMMO — PRESS R") : ""));
      _setTxt("reloadHint", rh);
    }

    // Radar zone label (strip "Màn N: " / "Stage N: " prefix so district name fits cleanly under radar)
    if (lvName) {
      var shortZone = lvName.replace(/^(Màn|Stage)\s*\d+\s*:\s*/i, "");
      _setTxt("radarZone", shortZone || lvName);
    }

    updateReloadBar(performance.now(), G);
    updateCrosshair(G);
  }

  function drawRadar(state) {
    var c = document.getElementById("fpsRadar");
    if (!c) return;
    var s = _resolveState(state);
    var pp = s.playerPos;
    if (!pp) return;
    var G = s.G;
    var level = s.level;

    var ctx = c.getContext("2d");
    if (!ctx) return;
    var w = c.width;
    var h = c.height;
    var cx = w * 0.5;
    var cy = h * 0.5;
    var R = cx - 9;
    var range = 52;
    var scale = R / range;
    var yaw = G.yaw || 0;
    var sy = Math.sin(yaw);
    var co = Math.cos(yaw);
    var nowMs = performance.now();

    ctx.clearRect(0, 0, w, h);

    // Base radar disc
    ctx.fillStyle = "rgba(8,12,10,0.88)";
    ctx.beginPath();
    ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
    ctx.fill();

    // Inner rotated static walls layer (cached offscreen once per level)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
    ctx.clip();

    if (level && Array.isArray(level.walls)) {
      if (_radarWallLvId !== level.id || _radarWallScale !== scale || _radarWallCount !== level.walls.length || !_radarWallCanvas) {
        _radarWallLvId = level.id;
        _radarWallScale = scale;
        _radarWallCount = level.walls.length;
        var arena = level.arena || 96;
        _radarWallSize = Math.ceil((arena + 16) * scale);
        if (!_radarWallCanvas) _radarWallCanvas = document.createElement("canvas");
        _radarWallCanvas.width = _radarWallSize;
        _radarWallCanvas.height = _radarWallSize;
        var wctx = _radarWallCanvas.getContext("2d");
        if (wctx) {
          wctx.clearRect(0, 0, _radarWallSize, _radarWallSize);
          var mid = _radarWallSize * 0.5;
          var walls = level.walls;
          wctx.lineWidth = 0.8;
          for (var wi = 0; wi < walls.length; wi++) {
            var wl = walls[wi];
            var tall = (wl.h || 2) >= 1.6;
            wctx.save();
            wctx.translate(mid + wl.x * scale, mid + wl.z * scale);
            if (wl.ry) wctx.rotate(-wl.ry);
            wctx.fillStyle = tall ? "rgba(96,104,112,0.88)" : "rgba(128,124,108,0.62)";
            wctx.strokeStyle = tall ? "rgba(175,186,192,0.45)" : "rgba(195,186,158,0.32)";
            var rw = wl.w * scale;
            var rd = wl.d * scale;
            wctx.fillRect(-rw * 0.5, -rd * 0.5, rw, rd);
            wctx.strokeRect(-rw * 0.5, -rd * 0.5, rw, rd);
            wctx.restore();
          }
        }
      }
      if (_radarWallCanvas) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(yaw);
        var halfS = _radarWallSize * 0.5;
        ctx.drawImage(_radarWallCanvas, -(halfS + pp.x * scale), -(halfS + pp.z * scale));
        ctx.restore();
      }
    }

    // Subtle range rings & crosshairs
    ctx.strokeStyle = "rgba(165,185,155,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // Outer perimeter ring
    ctx.strokeStyle = "rgba(165,185,155,0.36)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    function toRadar(wx, wz) {
      var dx = wx - pp.x;
      var dz = wz - pp.z;
      var rx = dx * co - dz * sy;
      var rz = dx * sy + dz * co;
      var px = cx + rx * scale;
      var py = cy + rz * scale;
      var d = Math.hypot(px - cx, py - cy);
      if (d > R - 3.5) {
        px = cx + ((px - cx) / d) * (R - 3.5);
        py = cy + ((py - cy) / d) * (R - 3.5);
      }
      return [px, py];
    }

    // Fire zones
    var fz = s.fireZones;
    if (fz && fz.length) {
      ctx.strokeStyle = "rgba(255,145,45,0.85)";
      ctx.lineWidth = 1.3;
      for (var fi = 0; fi < fz.length; fi++) {
        if (!fz[fi].active) continue;
        var fp = toRadar(fz[fi].x, fz[fi].z);
        ctx.beginPath();
        ctx.arc(fp[0], fp[1], 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Explosive barrels (crimson dots)
    var br = s.barrels;
    if (br && br.length) {
      for (var bi = 0; bi < br.length; bi++) {
        var b = br[bi];
        if (!b || b.alive === false) continue;
        var bp = toRadar(b.x, b.z);
        ctx.fillStyle = "#1c0509";
        ctx.beginPath();
        ctx.arc(bp[0], bp[1], 3.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#dc143c";
        ctx.beginPath();
        ctx.arc(bp[0], bp[1], 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Supply caches (green squares)
    var spList = s.supplies;
    if (spList && spList.length) {
      for (var si = 0; si < spList.length; si++) {
        var sp = spList[si];
        if (!sp || sp.alive === false || (sp.cd !== undefined && sp.cd > 0) || (sp.respawnT !== undefined && sp.respawnT > 0)) continue;
        var spt = toRadar(sp.x, sp.z);
        ctx.fillStyle = "#081a0e";
        ctx.fillRect(spt[0] - 3.6, spt[1] - 3.6, 7.2, 7.2);
        ctx.fillStyle = "#3eff8b";
        ctx.fillRect(spt[0] - 2.6, spt[1] - 2.6, 5.2, 5.2);
      }
    }

    // Extraction beacon diamond
    if (level && level.extractPos) {
      var ep = toRadar(level.extractPos.x, level.extractPos.z);
      var unlocked = !!G.portalUnlocked;
      var pulse = 0.78 + 0.22 * Math.sin(nowMs * 0.008);
      var sz = unlocked ? 5.2 : 4.2;
      ctx.save();
      ctx.translate(ep[0], ep[1]);
      ctx.rotate(Math.PI * 0.25);
      ctx.fillStyle = unlocked ? "rgba(45,255,136," + pulse.toFixed(2) + ")" : "rgba(255,168,51,0.9)";
      ctx.strokeStyle = "#04140a";
      ctx.lineWidth = 1.2;
      ctx.fillRect(-sz * 0.5, -sz * 0.5, sz, sz);
      ctx.strokeRect(-sz * 0.5, -sz * 0.5, sz, sz);
      ctx.restore();
    }

    // Zombies (pulsing red dots, larger for boss)
    var zb = s.zombies;
    if (zb && zb.length) {
      var zPulse = 0.72 + 0.28 * Math.sin(nowMs * 0.01);
      for (var zi = 0; zi < zb.length; zi++) {
        var z = zb[zi];
        if (!z || z.dead || !z.group) continue;
        var zp = toRadar(z.group.position.x, z.group.position.z);
        ctx.fillStyle = z.isBoss ? "#ff2a1f" : "rgba(255,82,72," + zPulse.toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(zp[0], zp[1], z.isBoss ? 3.8 : 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Rotated N compass badge on rim
    var nx = cx + sy * (R + 1);
    var ny = cy - co * (R + 1);
    ctx.fillStyle = "rgba(10,14,12,0.95)";
    ctx.beginPath();
    ctx.arc(nx, ny, 7.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffd45a";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = "#ffd45a";
    ctx.font = "bold 9.5px Consolas,monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", nx, ny + 0.5);

    // Center player heading chevron
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx - 3.4, cy + 3.6);
    ctx.lineTo(cx, cy + 1.8);
    ctx.lineTo(cx + 3.4, cy + 3.6);
    ctx.closePath();
    ctx.fill();
  }

  function updateExtractMarker(state) {
    var el = document.getElementById("extractMarker");
    if (!el) return;
    var s = _resolveState(state);
    var G = s.G;
    var pp = s.playerPos;
    var level = s.level;
    var cam = s.camera;

    if (G.state !== "playing" || !level || !level.extractPos || !pp || !cam || typeof THREE === "undefined") {
      _toggleHidden("extractMarker", true);
      return;
    }

    if (!_projV) _projV = new THREE.Vector3();
    if (!_viewV) _viewV = new THREE.Vector3();

    var ep = level.extractPos;
    var dist = Math.round(Math.hypot(ep.x - pp.x, ep.z - pp.z));
    _setTxt("extractDist", dist + "m");

    _viewV.set(ep.x, 3.2, ep.z).applyMatrix4(cam.matrixWorldInverse);
    var W = window.innerWidth || 1280;
    var H = window.innerHeight || 800;
    var margin = 28;
    var cx = W * 0.5;
    var cy = H * 0.5;
    var behind = _viewV.z >= -0.05;
    var sx, sy;

    if (!behind) {
      _projV.set(ep.x, 3.2, ep.z).project(cam);
      sx = (_projV.x * 0.5 + 0.5) * W;
      sy = (-_projV.y * 0.5 + 0.5) * H;
    } else {
      var vx = _viewV.x;
      var vy = _viewV.y;
      var len = Math.hypot(vx, vy);
      var ux = len < 0.001 ? 0 : vx / len;
      var uy = len < 0.001 ? 1 : -vy / len;
      var span = Math.max(W, H);
      sx = cx + ux * span;
      sy = cy + uy * span;
    }

    var offscreen = behind || sx < margin || sx > W - margin || sy < margin || sy > H - margin;
    if (offscreen) {
      var dx = sx - cx;
      var dy = sy - cy;
      var tx = dx > 0 ? (W - margin - cx) / dx : (dx < 0 ? (margin - cx) / dx : 1e9);
      var ty = dy > 0 ? (H - margin - cy) / dy : (dy < 0 ? (margin - cy) / dy : 1e9);
      var tRay = Math.min(tx, ty);
      sx = cx + dx * tRay;
      sy = cy + dy * tRay;
    }

    sx = Math.max(margin, Math.min(W - margin, sx));
    sy = Math.max(margin, Math.min(H - margin, sy));

    el.style.left = sx.toFixed(1) + "px";
    el.style.top = sy.toFixed(1) + "px";
    _toggleHidden("extractMarker", false);
    _toggleCls("extractMarker", "unlocked", !!G.portalUnlocked);
    _toggleCls("extractMarker", "offscreen", offscreen);
  }

  function announce(big, sub, durationMs) {
    var a = document.getElementById("announce");
    if (!a) return;
    var bEl = document.getElementById("annBig");
    var sEl = document.getElementById("annSub");
    if (bEl) bEl.textContent = big || "";
    if (sEl) sEl.textContent = sub || "";
    a.style.opacity = 1;
    clearTimeout(_annTimer);
    _annTimer = setTimeout(function () {
      a.style.opacity = 0;
    }, durationMs || 2400);
  }

  function showToast(msg, durationMs) {
    var el = document.getElementById("noteToast");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, durationMs || 3800);
  }

  function showHitmarker(kill) {
    var h = document.getElementById("hitmarker");
    if (!h) return;
    h.className = kill ? "kill" : "";
    h.style.opacity = 1;
    clearTimeout(_hitTimer);
    _hitTimer = setTimeout(function () {
      h.style.opacity = 0;
    }, kill ? 190 : 120);
  }

  function setDamageDir(fromX, fromZ, playerPos, yaw) {
    var fs = FPS.state || {};
    var pp = playerPos || fs.playerPos;
    var yw = yaw !== undefined ? yaw : (fs.G ? fs.G.yaw : 0);
    if (fromX === undefined || !pp) return;
    var ddx = fromX - pp.x;
    var ddz = fromZ - pp.z;
    var ang = Math.atan2(ddx * Math.cos(yw) + ddz * (-Math.sin(yw)), ddx * (-Math.sin(yw)) + ddz * (-Math.cos(yw))) * 180 / Math.PI;
    var de = document.getElementById("dmgDir");
    var rot = document.getElementById("dmgDirRot");
    if (rot) rot.style.transform = "rotate(" + ang.toFixed(1) + "deg)";
    if (de) {
      de.style.opacity = 1;
      clearTimeout(_dmgDirTimer);
      _dmgDirTimer = setTimeout(function () {
        de.style.opacity = 0;
      }, 420);
    }
  }

  function showLevelClear(levelDef, onPickPerk) {
    var g = (FPS.state && FPS.state.G) || {};
    g.state = "levelclear";
    document.body.classList.remove("playing");
    if (document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (e) {}
    }
    updateLockHint();
    _toggleHidden("extractMarker", true);
    _toggleHidden("extractBarWrap", true);

    var L = FPS.LANG || "vi";
    var lvName = levelDef ? (L === "en" ? (levelDef.nameEn || levelDef.nameVi) : (levelDef.nameVi || levelDef.nameEn)) : "";
    var titleEl = document.getElementById("lvClearTitle");
    var subEl = document.getElementById("lvClearSub");
    if (titleEl) titleEl.textContent = _t("levelClear", "HOÀN THÀNH MÀN!", "STAGE CLEARED!") + (lvName ? " · " + lvName : "");
    if (subEl) subEl.textContent = _t("levelClearSub", "Chọn 1 nâng cấp chiến thuật trước khi tiến sang màn tiếp theo", "Pick 1 tactical perk before deploying to the next stage");

    var wrap = document.getElementById("perkCards");
    if (wrap) {
      wrap.innerHTML = "";
      var pool = Array.isArray(FPS.PERKS) ? FPS.PERKS.slice() : [];
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
      }
      var picks = pool.slice(0, Math.min(3, pool.length));
      for (var k = 0; k < picks.length; k++) {
        (function (perk) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "upcard";
          btn.dataset.perkId = perk.id;
          var pName = L === "en" ? (perk.nameEn || perk.nameVi) : (perk.nameVi || perk.nameEn);
          var pDesc = L === "en" ? (perk.descEn || perk.descVi) : (perk.descVi || perk.descEn);
          btn.innerHTML = "<div class=\"ic\">" + (perk.ico || "★") + "</div><h3></h3><p></p>";
          btn.querySelector("h3").textContent = pName;
          btn.querySelector("p").textContent = pDesc;
          btn.onclick = function () {
            var scr = document.getElementById("levelClearScr");
            if (scr) scr.classList.add("hidden");
            if (typeof onPickPerk === "function") onPickPerk(perk);
          };
          wrap.appendChild(btn);
        })(picks[k]);
      }
    }

    var scr = document.getElementById("levelClearScr");
    if (scr) scr.classList.remove("hidden");
    updateHUD();
  }

  function showEndScreen(win, state) {
    document.body.classList.remove("playing");
    if (document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (e) {}
    }
    updateLockHint();
    _toggleHidden("extractMarker", true);
    _toggleHidden("extractBarWrap", true);

    var isWin = (typeof win === "object" && win !== null) ? !!win.win : !!win;
    var st = (typeof win === "object" && win !== null) ? win : (state || (FPS.state && FPS.state.G) || {});
    var score = Math.floor(st.score || 0);
    var kills = st.kills !== undefined ? st.kills : (st.totalKills || 0);
    var levelNum = st.level !== undefined ? st.level : ((st.levelIdx || 0) + 1);
    var timeSec = st.time || 0;

    var et = document.getElementById("endTitle");
    if (et) {
      et.textContent = isWin ? _t("winT", "CHIẾN DỊCH HOÀN TẤT!", "CAMPAIGN COMPLETE!") : _t("loseT", "BẠN ĐÃ GỤC NGÃ", "YOU HAVE FALLEN");
      et.className = "title" + (isWin ? " win" : "");
    }
    _setTxt("endSub", isWin ? _t("winS", "", "") : _t("loseS", "", ""));
    _setTxt("eScore", String(score));
    _setTxt("eKills", String(kills));
    _setTxt("eLevel", String(levelNum));
    _setTxt("eTime", fmtTime(timeSec));

    var endScr = document.getElementById("endScr");
    if (endScr) endScr.classList.remove("hidden");
  }

  async function syncBackendUI(selectedLevelId, onPickLevel) {
    if (!window.FPSApi) return null;
    var prof = await FPSApi.loadProfile();
    var lb = await FPSApi.loadLeaderboard();
    if (prof && prof.lang) applyLang(prof.lang);

    var el = document.getElementById("lbBox");
    if (el) {
      var L = FPS.LANG || "vi";
      var top = lb && lb[0]
        ? ("Top #1: " + lb[0].name + " (" + lb[0].score + " pts, S" + (lb[0].level || lb[0].wave || 1) + ")")
        : (L === "en" ? "No runs recorded yet" : "Chưa có kỷ lục");
      var totalStages = (FPS.LEVELS && FPS.LEVELS.length) || 5;
      var best = prof && prof.bestScore
        ? ("Best: " + prof.bestScore + " pts · " + (L === "en" ? "Stage " : "Màn ") + (prof.highestLevel || prof.bestWave || 1) + "/" + totalStages)
        : (L === "en" ? ("Unlocked: Stage " + ((prof && prof.highestLevel) || 1) + "/" + totalStages) : ("Đã mở: Màn " + ((prof && prof.highestLevel) || 1) + "/" + totalStages));
      el.innerHTML = "<span></span><span></span>";
      el.children[0].textContent = best;
      el.children[1].textContent = top;
    }

    renderLevelSelect(prof, selectedLevelId || _lastSelect.selectedLevelId || 1, onPickLevel || _lastSelect.onPickLevel);
    return prof;
  }

  return {
    applyLang: applyLang,
    renderLevelSelect: renderLevelSelect,
    updateHUD: updateHUD,
    drawRadar: drawRadar,
    updateExtractMarker: updateExtractMarker,
    announce: announce,
    showToast: showToast,
    showLevelClear: showLevelClear,
    showEndScreen: showEndScreen,
    syncBackendUI: syncBackendUI,
    updateWeaponLabel: updateWeaponLabel,
    updateReloadBar: updateReloadBar,
    updateCrosshair: updateCrosshair,
    updateLockHint: updateLockHint,
    setQualityBadge: setQualityBadge,
    showHitmarker: showHitmarker,
    setDamageDir: setDamageDir,
    fmtTime: fmtTime
  };
})();
