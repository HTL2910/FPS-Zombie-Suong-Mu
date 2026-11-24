"use strict";
var FPS = (window.FPS = window.FPS || {});

FPS.audio = (function () {
  var AC = null;
  var masterGain = null;
  var ambientNodes = [];
  var _vol = 0.7;
  var _noiseCache = {};
  var _groanCount = 0;
  var _groanLast = 0;

  function init() {
    if (AC) {
      if (AC.state === "suspended" && typeof AC.resume === "function") {
        try { AC.resume(); } catch (e) {}
      }
      return;
    }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = AC.createGain();
      masterGain.gain.value = _vol;
      masterGain.connect(AC.destination);
    } catch (e) {}
  }

  function setVolume(v) {
    var n = Number(v);
    if (!Number.isFinite(n)) n = 0.7;
    if (n > 1) n = n / 100;
    _vol = Math.max(0, Math.min(1, n));
    if (masterGain) masterGain.gain.value = _vol;
    return _vol;
  }

  function noiseBuf(dur) {
    var key = Math.round(dur * 20);
    if (_noiseCache[key]) return _noiseCache[key];
    var len = Math.max(1, Math.ceil(AC.sampleRate * dur));
    var b = AC.createBuffer(1, len, AC.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    _noiseCache[key] = b;
    return b;
  }

  function playNoise(dur, freq, vol, type, slideFreq) {
    if (!AC || !masterGain) return;
    var s = AC.createBufferSource();
    s.buffer = noiseBuf(dur);
    var f = AC.createBiquadFilter();
    f.type = type || "lowpass";
    f.frequency.setValueAtTime(freq, AC.currentTime);
    if (slideFreq) f.frequency.exponentialRampToValueAtTime(Math.max(20, slideFreq), AC.currentTime + dur);
    var g = AC.createGain();
    g.gain.setValueAtTime(Math.max(0.001, vol), AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    s.connect(f);
    f.connect(g);
    g.connect(masterGain);
    s.start();
    s.stop(AC.currentTime + dur);
  }

  function playTone(freq, dur, vol, type, slideTo, delay) {
    if (!AC || !masterGain) return;
    var t0 = AC.currentTime + (delay || 0);
    var o = AC.createOscillator();
    o.type = type || "sine";
    o.frequency.setValueAtTime(Math.max(16, freq), t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(16, slideTo), t0 + dur);
    var g = AC.createGain();
    g.gain.setValueAtTime(Math.max(0.001, vol), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(masterGain);
    o.start(t0);
    o.stop(t0 + dur);
  }

  function startAmbient() {
    if (!AC || !masterGain || ambientNodes.length) return;
    try {
      var s = AC.createBufferSource();
      s.buffer = noiseBuf(4);
      s.loop = true;
      var f = AC.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 250;
      var g = AC.createGain();
      g.gain.value = 0.13;
      s.connect(f);
      f.connect(g);
      g.connect(masterGain);
      s.start();
      ambientNodes.push(s);
    } catch (e) {}
  }

  function sfxShoot(kind) {
    if (!AC) return;
    if (kind === "thuanthien") {
      playNoise(0.16, 2800, 0.45, "bandpass");
      playTone(540, 0.18, 0.28, "triangle", 190);
      playTone(980, 0.12, 0.15, "sine", 1480);
    } else if (kind === "pistol") {
      playNoise(0.12, 1850, 0.48, "bandpass");
      playTone(170, 0.085, 0.34, "square", 58);
    } else if (kind === "shotgun") {
      playNoise(0.32, 740, 0.8, "lowpass", 180);
      playTone(105, 0.24, 0.52, "sawtooth", 36);
    } else {
      playNoise(0.07, 2450, 0.36, "bandpass");
      playTone(215, 0.055, 0.24, "square", 78);
    }
  }

  function sfxReload() {
    if (!AC) return;
    playTone(500, 0.07, 0.15, "square", 380, 0);
    playTone(310, 0.07, 0.15, "square", 240, 0.16);
    playTone(720, 0.09, 0.2, "square", 860, 0.34);
  }

  function sfxHit(kill) {
    if (!AC) return;
    playNoise(0.08, 920, 0.3, "bandpass");
    if (kill) {
      playTone(82, 0.32, 0.38, "sawtooth", 34);
      playNoise(0.28, 420, 0.34, "lowpass");
    }
  }

  function sfxHeadshot() {
    if (!AC) return;
    playNoise(0.06, 2600, 0.32, "bandpass");
    playTone(1380, 0.11, 0.24, "sine", 2180);
    playTone(860, 0.09, 0.18, "triangle", 1240);
  }

  function sfxHurt() {
    if (!AC) return;
    playTone(115, 0.2, 0.4, "sawtooth", 56);
    playNoise(0.15, 500, 0.25, "lowpass");
  }

  function sfxPickup() {
    if (!AC) return;
    playTone(660, 0.09, 0.2, "sine", 740, 0);
    playTone(990, 0.13, 0.22, "sine", 1180, 0.08);
  }

  function sfxExplosion() {
    if (!AC) return;
    playTone(115, 0.65, 0.62, "sine", 24);
    playTone(160, 0.42, 0.42, "sawtooth", 32);
    playNoise(0.85, 1900, 0.85, "lowpass", 140);
    playNoise(0.24, 2400, 0.35, "bandpass", 520);
  }

  function sfxPortalUnlock() {
    if (!AC) return;
    var notes = [293.66, 369.99, 440.0, 587.33, 880.0];
    for (var i = 0; i < notes.length; i++) {
      playTone(notes[i], 0.34, 0.2, i % 2 === 0 ? "triangle" : "sine", notes[i] * 1.015, i * 0.075);
    }
    playNoise(0.45, 2200, 0.16, "bandpass", 4200);
  }

  function sfxLevelClear() {
    if (!AC) return;
    var chord = [261.63, 329.63, 392.0, 523.25];
    for (var i = 0; i < chord.length; i++) {
      playTone(chord[i], 0.55, 0.18, "triangle", chord[i], i * 0.06);
    }
    playTone(659.25, 0.65, 0.22, "sine", 783.99, 0.28);
  }

  function sfxBulletWall() {
    if (!AC) return;
    playNoise(0.045, 2600, 0.16, "bandpass", 900);
    var p = 1750 + Math.random() * 950;
    playTone(p, 0.065, 0.11, "triangle", p * (0.55 + Math.random() * 0.4));
  }

  function sfxBossRoar() {
    if (!AC) return;
    playTone(72, 0.85, 0.46, "sawtooth", 30);
    playTone(108, 0.78, 0.34, "square", 44);
    playNoise(0.8, 520, 0.36, "bandpass", 190);
  }

  function sfxGroan() {
    if (!AC) return;
    var n = performance.now();
    if (_groanCount >= 2 || n - _groanLast < 120) return;
    _groanLast = n;
    _groanCount++;
    setTimeout(function () { _groanCount = Math.max(0, _groanCount - 1); }, 800);
    var f = 55 + Math.random() * 50;
    playTone(f, 0.7 + Math.random() * 0.5, 0.13, "sawtooth", f * 0.6);
  }

  function sfxScream() {
    if (!AC) return;
    playTone(900, 0.9, 0.38, "sawtooth", 1800);
    playTone(1250, 0.9, 0.24, "square", 2400);
    playNoise(0.9, 3000, 0.18, "highpass");
  }

  function sfxSting() {
    if (!AC) return;
    [620, 588, 440, 466].forEach(function (f, i) {
      playTone(f, 0.55, 0.22, "sawtooth", f * 0.92, i * 0.055);
      playTone(f * 1.02, 0.55, 0.12, "square", f * 1.02, i * 0.055);
    });
    playNoise(0.5, 2600, 0.18, "highpass");
  }

  function sfxBassDrop() {
    if (!AC) return;
    playTone(120, 0.9, 0.55, "sine", 28);
    playTone(65, 1.0, 0.4, "triangle", 24);
  }

  function sfxWhisper(pan) {
    if (!AC || !masterGain) return;
    try {
      var s = AC.createBufferSource();
      s.buffer = noiseBuf(0.9);
      var f = AC.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(1400, AC.currentTime);
      f.frequency.exponentialRampToValueAtTime(2800, AC.currentTime + 0.7);
      f.Q.value = 3.5;
      var g = AC.createGain();
      g.gain.setValueAtTime(0.001, AC.currentTime);
      g.gain.linearRampToValueAtTime(0.18, AC.currentTime + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.9);
      if (AC.createStereoPanner) {
        var p = AC.createStereoPanner();
        p.pan.value = pan || 0;
        s.connect(f); f.connect(g); g.connect(p); p.connect(masterGain);
      } else {
        s.connect(f); f.connect(g); g.connect(masterGain);
      }
      s.start();
      s.stop(AC.currentTime + 0.9);
    } catch (e) {}
  }

  function sfxHeartbeat(rate) {
    if (!AC) return;
    playTone(52, 0.14, 0.5, "sine", 38);
    playTone(48, 0.11, 0.35, "sine", 36, Math.max(0.14, (rate || 600) * 0.00028));
  }

  function sfxCrow() {
    if (!AC) return;
    for (var i = 0; i < 3; i++) {
      playNoise(0.16, 900, 0.2, "bandpass");
      playTone(720, 0.14, 0.11, "sawtooth", 420, i * 0.17);
    }
  }

  function sfxDoorSlam() {
    if (!AC) return;
    playNoise(0.22, 320, 0.58, "lowpass");
    playTone(70, 0.3, 0.48, "sine", 35);
    playTone(180, 0.08, 0.2, "square", 90, 0.04);
  }

  return {
    init: init,
    setVolume: setVolume,
    startAmbient: startAmbient,
    sfxShoot: sfxShoot,
    sfxReload: sfxReload,
    sfxHit: sfxHit,
    sfxHeadshot: sfxHeadshot,
    sfxHurt: sfxHurt,
    sfxPickup: sfxPickup,
    sfxExplosion: sfxExplosion,
    sfxPortalUnlock: sfxPortalUnlock,
    sfxLevelClear: sfxLevelClear,
    sfxBulletWall: sfxBulletWall,
    sfxBossRoar: sfxBossRoar,
    sfxGroan: sfxGroan,
    sfxScream: sfxScream,
    sfxSting: sfxSting,
    sfxBassDrop: sfxBassDrop,
    sfxWhisper: sfxWhisper,
    sfxHeartbeat: sfxHeartbeat,
    sfxCrow: sfxCrow,
    sfxDoorSlam: sfxDoorSlam,
    playTone: playTone,
    playNoise: playNoise
  };
})();
