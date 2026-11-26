"use strict";
var FPS = (window.FPS = window.FPS || {});

FPS.audio = (function () {
  var AC = null;
  var masterGain = null;
  var ambientNodes = [];
  var _vol = 0.7;
  var _noiseCache = {};
  var _cueState = {};
  var _activeVoices = [];
  var _MAX_VOICES = 24;

  function _nowMs() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  function _canPlaySfx() {
    return !!(AC && masterGain && AC.state === "running" && _vol > 0.0001);
  }

  function _finite(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function _pruneActive(arr, now) {
    var w = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] > now) arr[w++] = arr[i];
    }
    arr.length = w;
  }

  function _allowCue(key, minMs, maxConc, holdMs) {
    if (!_canPlaySfx()) return false;
    var now = _nowMs();
    _pruneActive(_activeVoices, now);
    if (_activeVoices.length >= _MAX_VOICES) return false;

    var st = _cueState[key];
    if (!st) st = _cueState[key] = { last: -Infinity, active: [] };
    _pruneActive(st.active, now);

    if (minMs && (now - st.last) < minMs) return false;
    if (maxConc && st.active.length >= maxConc) return false;

    st.last = now;
    var durMs = Math.max(40, _finite(holdMs, 200) || 200);
    st.active.push(now + durMs);
    _activeVoices.push(now + durMs);
    return true;
  }

  function init() {
    if (AC) {
      if (AC.state === "suspended" && typeof AC.resume === "function") {
        try {
          var p = AC.resume();
          if (p && typeof p.catch === "function") p.catch(function () {});
        } catch (e) {}
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
    var n = (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) ? NaN : Number(v);
    if (!Number.isFinite(n)) n = 0.7;
    if (n > 1) n = n / 100;
    _vol = Math.max(0, Math.min(1, n));
    if (masterGain) {
      masterGain.gain.value = _vol;
      if (AC && masterGain.gain.setValueAtTime) {
        try { masterGain.gain.setValueAtTime(_vol, AC.currentTime); } catch (e) {}
      }
    }
    return _vol;
  }

  function noiseBuf(dur) {
    var dn = Number(dur);
    var dSec = (Number.isFinite(dn) && dn > 0) ? Math.max(0.05, Math.min(10, dn)) : 0.1;
    var key = Math.max(1, Math.ceil(dSec * 20));
    if (_noiseCache[key]) return _noiseCache[key];
    var bufDur = key / 20;
    var len = Math.max(1, Math.ceil(AC.sampleRate * bufDur));
    var b = AC.createBuffer(1, len, AC.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    _noiseCache[key] = b;
    return b;
  }

  function _connectOut(node, pan) {
    if (typeof pan === "number" && Number.isFinite(pan) && pan !== 0 && AC.createStereoPanner) {
      var p = AC.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      p.connect(masterGain);
    } else {
      node.connect(masterGain);
    }
  }

  function _playToneEx(opts) {
    if (!_canPlaySfx() || !opts) return;
    try {
      var dur = Math.max(0.015, _finite(opts.dur, 0.1));
      var delay = Math.max(0, _finite(opts.delay, 0));
      var t0 = AC.currentTime + delay;
      var tEnd = t0 + dur;
      var o = AC.createOscillator();
      o.type = opts.type || "sine";
      var freq = Math.max(16, _finite(opts.freq, 220));
      o.frequency.setValueAtTime(freq, t0);
      var slideTo = (opts.slideTo !== undefined && opts.slideTo !== null) ? _finite(opts.slideTo, 0) : 0;
      if (slideTo > 0) {
        o.frequency.exponentialRampToValueAtTime(Math.max(16, slideTo), tEnd);
      }
      var g = AC.createGain();
      var v = Math.max(0.002, _finite(opts.vol, 0.2));
      var attack = _finite(opts.attack, 0);
      if (attack > 0) {
        var atk = Math.min(dur * 0.6, attack);
        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(v, t0 + atk);
        g.gain.exponentialRampToValueAtTime(0.001, tEnd);
      } else {
        g.gain.setValueAtTime(v, t0);
        g.gain.exponentialRampToValueAtTime(0.001, tEnd);
      }
      o.connect(g);
      _connectOut(g, opts.pan);
      o.start(t0);
      o.stop(tEnd + 0.01);
    } catch (e) {}
  }

  function _playNoiseEx(opts) {
    if (!_canPlaySfx() || !opts) return;
    try {
      var dur = Math.max(0.02, _finite(opts.dur, 0.1));
      var delay = Math.max(0, _finite(opts.delay, 0));
      var t0 = AC.currentTime + delay;
      var tEnd = t0 + dur;
      var s = AC.createBufferSource();
      s.buffer = noiseBuf(dur);
      var f = AC.createBiquadFilter();
      f.type = opts.type || "lowpass";
      var freq = Math.max(20, _finite(opts.freq, 1000));
      f.frequency.setValueAtTime(freq, t0);
      var slideFreq = (opts.slideFreq !== undefined && opts.slideFreq !== null) ? _finite(opts.slideFreq, 0) : 0;
      if (slideFreq > 0) {
        f.frequency.exponentialRampToValueAtTime(Math.max(20, slideFreq), tEnd);
      }
      if (typeof opts.q === "number" && Number.isFinite(opts.q)) {
        f.Q.value = Math.max(0.1, opts.q);
      }
      var g = AC.createGain();
      var v = Math.max(0.002, _finite(opts.vol, 0.2));
      var attack = _finite(opts.attack, 0);
      if (attack > 0) {
        var atk = Math.min(dur * 0.6, attack);
        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(v, t0 + atk);
        g.gain.exponentialRampToValueAtTime(0.001, tEnd);
      } else {
        g.gain.setValueAtTime(v, t0);
        g.gain.exponentialRampToValueAtTime(0.001, tEnd);
      }
      s.connect(f);
      f.connect(g);
      _connectOut(g, opts.pan);
      s.start(t0);
      s.stop(tEnd + 0.01);
    } catch (e) {}
  }

  function playNoise(dur, freq, vol, type, slideFreq) {
    if (!_canPlaySfx()) return;
    try {
      var d = Math.max(0.02, _finite(dur, 0.1));
      var fq = Math.max(20, _finite(freq, 1000));
      var v = Math.max(0.001, _finite(vol, 0.2));
      var sf = (slideFreq !== undefined && slideFreq !== null) ? _finite(slideFreq, 0) : 0;
      var s = AC.createBufferSource();
      s.buffer = noiseBuf(d);
      var f = AC.createBiquadFilter();
      f.type = type || "lowpass";
      f.frequency.setValueAtTime(fq, AC.currentTime);
      if (sf > 0) f.frequency.exponentialRampToValueAtTime(Math.max(20, sf), AC.currentTime + d);
      var g = AC.createGain();
      g.gain.setValueAtTime(v, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + d);
      s.connect(f);
      f.connect(g);
      g.connect(masterGain);
      s.start();
      s.stop(AC.currentTime + d);
    } catch (e) {}
  }

  function playTone(freq, dur, vol, type, slideTo, delay) {
    if (!_canPlaySfx()) return;
    try {
      var fq = Math.max(16, _finite(freq, 220));
      var d = Math.max(0.015, _finite(dur, 0.1));
      var v = Math.max(0.001, _finite(vol, 0.2));
      var del = Math.max(0, _finite(delay, 0));
      var st = (slideTo !== undefined && slideTo !== null) ? _finite(slideTo, 0) : 0;
      var t0 = AC.currentTime + del;
      var o = AC.createOscillator();
      o.type = type || "sine";
      o.frequency.setValueAtTime(fq, t0);
      if (st > 0) o.frequency.exponentialRampToValueAtTime(Math.max(16, st), t0 + d);
      var g = AC.createGain();
      g.gain.setValueAtTime(v, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
      o.connect(g);
      g.connect(masterGain);
      o.start(t0);
      o.stop(t0 + d);
    } catch (e) {}
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
    if (!_allowCue("groan", 120, 2, 800)) return;
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
    if (!_canPlaySfx()) return;
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
        p.pan.value = Math.max(-1, Math.min(1, _finite(pan, 0)));
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
    var rNum = _finite(rate, 600);
    playTone(52, 0.14, 0.5, "sine", 38);
    playTone(48, 0.11, 0.35, "sine", 36, Math.max(0.14, (rNum || 600) * 0.00028));
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

  // ---------------------------------------------------------------------------
  // Full v9.0 Procedural Cues (0 external files, rate-limited & voice-capped)
  // ---------------------------------------------------------------------------
  function sfxShove() {
    if (!_allowCue("shove", 180, 2, 180)) return;
    _playNoiseEx({ dur: 0.14, freq: 950, slideFreq: 320, type: "bandpass", q: 1.4, vol: 0.42, delay: 0 });
    _playToneEx({ freq: 145, slideTo: 48, dur: 0.13, vol: 0.44, type: "triangle", delay: 0 });
    _playToneEx({ freq: 340, slideTo: 120, dur: 0.045, vol: 0.16, type: "square", delay: 0.015 });
  }

  function sfxSpitterSpit(pan) {
    if (!_allowCue("spitterSpit", 280, 2, 360)) return;
    _playNoiseEx({ dur: 0.26, freq: 2600, slideFreq: 750, type: "bandpass", q: 3.2, vol: 0.36, delay: 0, pan: pan });
    _playNoiseEx({ dur: 0.32, freq: 3400, slideFreq: 1800, type: "highpass", vol: 0.20, delay: 0.04, pan: pan });
    _playToneEx({ freq: 460, slideTo: 135, dur: 0.18, vol: 0.22, type: "sawtooth", delay: 0, pan: pan });
  }

  function sfxBloaterWarn() {
    if (!_allowCue("bloaterWarn", 500, 2, 500)) return;
    _playToneEx({ freq: 68, slideTo: 96, dur: 0.48, vol: 0.30, type: "sawtooth", attack: 0.06, delay: 0 });
    _playToneEx({ freq: 150, slideTo: 230, dur: 0.08, vol: 0.20, type: "sine", delay: 0.05 });
    _playToneEx({ freq: 185, slideTo: 270, dur: 0.08, vol: 0.20, type: "sine", delay: 0.17 });
    _playToneEx({ freq: 215, slideTo: 310, dur: 0.09, vol: 0.20, type: "sine", delay: 0.29 });
    _playNoiseEx({ dur: 0.42, freq: 650, slideFreq: 1250, type: "bandpass", q: 2.8, vol: 0.18, attack: 0.05, delay: 0 });
  }

  function sfxBloaterBoom() {
    if (!_allowCue("bloaterBoom", 150, 2, 750)) return;
    _playToneEx({ freq: 98, slideTo: 22, dur: 0.72, vol: 0.65, type: "sine", delay: 0 });
    _playToneEx({ freq: 135, slideTo: 28, dur: 0.45, vol: 0.42, type: "sawtooth", delay: 0 });
    _playNoiseEx({ dur: 0.78, freq: 1200, slideFreq: 110, type: "lowpass", vol: 0.72, delay: 0 });
    _playNoiseEx({ dur: 0.42, freq: 2800, slideFreq: 620, type: "bandpass", q: 2.2, vol: 0.46, delay: 0.03 });
    _playToneEx({ freq: 2900, slideTo: 2400, dur: 0.45, vol: 0.07, type: "sine", attack: 0.03, delay: 0.05 });
  }

  function sfxStalkerHiss(pan) {
    if (!_allowCue("stalkerHiss", 600, 2, 650)) return;
    _playNoiseEx({ dur: 0.65, freq: 1600, slideFreq: 4200, type: "bandpass", q: 4.5, vol: 0.28, attack: 0.12, delay: 0, pan: pan });
    _playToneEx({ freq: 680, slideTo: 1320, dur: 0.52, vol: 0.16, type: "sawtooth", attack: 0.05, delay: 0, pan: pan });
    _playToneEx({ freq: 725, slideTo: 1410, dur: 0.52, vol: 0.14, type: "triangle", attack: 0.05, delay: 0, pan: pan });
    _playNoiseEx({ dur: 0.22, freq: 3600, type: "highpass", vol: 0.16, delay: 0.08, pan: pan });
  }

  function sfxTrapActivate(kind) {
    if (!_allowCue("trapActivate", 200, 2, 550)) return;
    _playToneEx({ freq: 260, slideTo: 140, dur: 0.06, vol: 0.24, type: "square", delay: 0 });
    if (kind === "fire") {
      _playNoiseEx({ dur: 0.48, freq: 520, slideFreq: 2100, type: "bandpass", q: 1.2, vol: 0.46, delay: 0.02 });
      _playNoiseEx({ dur: 0.55, freq: 900, slideFreq: 280, type: "lowpass", vol: 0.42, delay: 0.05 });
      _playToneEx({ freq: 130, slideTo: 45, dur: 0.22, vol: 0.34, type: "sine", delay: 0.03 });
    } else {
      _playNoiseEx({ dur: 0.22, freq: 3600, slideFreq: 1100, type: "bandpass", q: 3.0, vol: 0.42, delay: 0.02 });
      _playToneEx({ freq: 120, slideTo: 118, dur: 0.42, vol: 0.26, type: "sawtooth", delay: 0.03 });
      _playToneEx({ freq: 240, slideTo: 480, dur: 0.14, vol: 0.18, type: "square", delay: 0.04 });
      _playNoiseEx({ dur: 0.10, freq: 4200, type: "highpass", vol: 0.25, delay: 0.15 });
      _playNoiseEx({ dur: 0.10, freq: 4200, type: "highpass", vol: 0.25, delay: 0.28 });
    }
  }

  function sfxBarricadeHit() {
    if (!_allowCue("barricadeHit", 180, 3, 160)) return;
    var f0 = 120 + Math.random() * 30;
    _playToneEx({ freq: f0, slideTo: 58, dur: 0.11, vol: 0.32, type: "triangle", delay: 0 });
    _playNoiseEx({ dur: 0.09, freq: 720, slideFreq: 340, type: "bandpass", q: 2.4, vol: 0.34, delay: 0 });
    _playNoiseEx({ dur: 0.045, freq: 2200, type: "highpass", vol: 0.18, delay: 0.015 });
  }

  function sfxBarricadeBreak() {
    if (!_allowCue("barricadeBreak", 150, 2, 400)) return;
    _playToneEx({ freq: 240, slideTo: 62, dur: 0.16, vol: 0.38, type: "sawtooth", delay: 0 });
    _playNoiseEx({ dur: 0.36, freq: 1650, slideFreq: 380, type: "bandpass", q: 1.5, vol: 0.54, delay: 0 });
    _playNoiseEx({ dur: 0.14, freq: 2600, type: "highpass", vol: 0.28, delay: 0.09 });
    _playNoiseEx({ dur: 0.14, freq: 2600, type: "highpass", vol: 0.28, delay: 0.19 });
    _playToneEx({ freq: 88, slideTo: 30, dur: 0.32, vol: 0.45, type: "sine", delay: 0.06 });
  }

  function sfxArmoryBuy() {
    if (!_allowCue("armoryBuy", 120, 2, 320)) return;
    _playToneEx({ freq: 420, slideTo: 640, dur: 0.06, vol: 0.18, type: "square", delay: 0 });
    _playNoiseEx({ dur: 0.08, freq: 2400, slideFreq: 1200, type: "bandpass", q: 1.8, vol: 0.26, delay: 0.02 });
    _playToneEx({ freq: 587.33, dur: 0.10, vol: 0.22, type: "triangle", delay: 0.07 });
    _playToneEx({ freq: 880, dur: 0.18, vol: 0.24, type: "sine", delay: 0.13 });
  }

  function sfxAnvilUpgrade() {
    if (!_allowCue("anvilUpgrade", 180, 2, 480)) return;
    _playNoiseEx({ dur: 0.05, freq: 3200, slideFreq: 1100, type: "bandpass", q: 1.6, vol: 0.34, delay: 0 });
    _playToneEx({ freq: 1046.5, dur: 0.48, vol: 0.24, type: "triangle", delay: 0 });
    _playToneEx({ freq: 1568, dur: 0.42, vol: 0.18, type: "sine", delay: 0 });
    _playToneEx({ freq: 2349, dur: 0.34, vol: 0.11, type: "sine", delay: 0.005 });
    _playNoiseEx({ dur: 0.26, freq: 3800, slideFreq: 2200, type: "highpass", vol: 0.14, delay: 0.10 });
  }

  function sfxGeneratorTick() {
    if (!_allowCue("generatorTick", 110, 2, 80)) return;
    _playToneEx({ freq: 760, slideTo: 520, dur: 0.04, vol: 0.16, type: "triangle", delay: 0 });
    _playNoiseEx({ dur: 0.03, freq: 2200, type: "bandpass", q: 3.0, vol: 0.14, delay: 0 });
  }

  function sfxGeneratorOn() {
    if (!_allowCue("generatorOn", 250, 2, 660)) return;
    _playToneEx({ freq: 140, slideTo: 60, dur: 0.12, vol: 0.30, type: "square", delay: 0 });
    _playToneEx({ freq: 75, slideTo: 220, dur: 0.62, vol: 0.26, type: "sawtooth", attack: 0.08, delay: 0.04 });
    _playToneEx({ freq: 150, slideTo: 440, dur: 0.58, vol: 0.20, type: "triangle", attack: 0.08, delay: 0.06 });
    _playNoiseEx({ dur: 0.38, freq: 400, slideFreq: 1800, type: "bandpass", q: 1.8, vol: 0.22, delay: 0.08 });
  }

  function sfxRelicPickup() {
    if (!_allowCue("relicPickup", 200, 2, 630)) return;
    _playToneEx({ freq: 523.25, dur: 0.24, vol: 0.22, type: "sine", delay: 0 });
    _playToneEx({ freq: 659.25, dur: 0.26, vol: 0.22, type: "sine", delay: 0.07 });
    _playToneEx({ freq: 783.99, dur: 0.32, vol: 0.20, type: "triangle", delay: 0.14 });
    _playToneEx({ freq: 1046.5, dur: 0.42, vol: 0.22, type: "sine", delay: 0.21 });
    _playNoiseEx({ dur: 0.32, freq: 2600, slideFreq: 3800, type: "bandpass", q: 4.0, vol: 0.10, attack: 0.05, delay: 0.05 });
  }

  function sfxTotemBreak() {
    if (!_allowCue("totemBreak", 200, 2, 620)) return;
    _playNoiseEx({ dur: 0.42, freq: 1800, slideFreq: 220, type: "lowpass", vol: 0.52, delay: 0 });
    _playNoiseEx({ dur: 0.24, freq: 3200, type: "highpass", vol: 0.30, delay: 0.02 });
    _playToneEx({ freq: 380, slideTo: 72, dur: 0.58, vol: 0.32, type: "sawtooth", delay: 0.04 });
    _playToneEx({ freq: 540, slideTo: 95, dur: 0.50, vol: 0.20, type: "triangle", delay: 0.06 });
  }

  function sfxFlareLaunch() {
    if (!_allowCue("flareLaunch", 250, 2, 720)) return;
    _playToneEx({ freq: 180, slideTo: 68, dur: 0.14, vol: 0.42, type: "triangle", delay: 0 });
    _playToneEx({ freq: 620, slideTo: 2150, dur: 0.52, vol: 0.22, type: "sine", delay: 0.03 });
    _playNoiseEx({ dur: 0.48, freq: 1400, slideFreq: 3200, type: "bandpass", q: 2.0, vol: 0.30, delay: 0.02 });
    _playNoiseEx({ dur: 0.22, freq: 2200, slideFreq: 800, type: "bandpass", q: 1.5, vol: 0.32, delay: 0.50 });
  }

  var _HS_SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
  function sfxHeadshotStreak(streak) {
    if (!_allowCue("headshotStreak", 90, 2, 340)) return;
    var sNum = _finite(streak, 1);
    var t = Math.max(1, Math.min(8, Math.floor(sNum || 1)));
    var f = _HS_SCALE[t - 1];
    _playToneEx({ freq: f, slideTo: f * 1.01, dur: 0.16, vol: 0.22, type: "sine", delay: 0 });
    _playToneEx({ freq: f * 1.5, dur: 0.22, vol: 0.16, type: "triangle", delay: 0.055 });
    if (t >= 3) {
      _playToneEx({ freq: f * 2.0, dur: 0.24, vol: 0.14, type: "sine", delay: 0.10 });
    }
  }

  function sfxBreather() {
    if (!_allowCue("breather", 1500, 1, 950)) return;
    _playNoiseEx({ dur: 0.95, freq: 950, slideFreq: 340, type: "bandpass", q: 1.4, vol: 0.14, attack: 0.22, delay: 0 });
    _playToneEx({ freq: 293.66, slideTo: 220, dur: 0.85, vol: 0.15, type: "sine", attack: 0.12, delay: 0.04 });
    _playToneEx({ freq: 110, dur: 0.90, vol: 0.12, type: "triangle", attack: 0.15, delay: 0.08 });
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
    playNoise: playNoise,
    sfxShove: sfxShove,
    sfxSpitterSpit: sfxSpitterSpit,
    sfxBloaterWarn: sfxBloaterWarn,
    sfxBloaterBoom: sfxBloaterBoom,
    sfxStalkerHiss: sfxStalkerHiss,
    sfxTrapActivate: sfxTrapActivate,
    sfxBarricadeHit: sfxBarricadeHit,
    sfxBarricadeBreak: sfxBarricadeBreak,
    sfxArmoryBuy: sfxArmoryBuy,
    sfxAnvilUpgrade: sfxAnvilUpgrade,
    sfxGeneratorTick: sfxGeneratorTick,
    sfxGeneratorOn: sfxGeneratorOn,
    sfxRelicPickup: sfxRelicPickup,
    sfxTotemBreak: sfxTotemBreak,
    sfxFlareLaunch: sfxFlareLaunch,
    sfxHeadshotStreak: sfxHeadshotStreak,
    sfxBreather: sfxBreather
  };
})();
