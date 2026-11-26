"use strict";
window.FPSApi = (function () {
  const LS_KEY = "fps_zombie_profile_v8";
  const LS_LB_KEY = "fps_zombie_leaderboard_v8";
  const IS_STATIC = !!window.__ITCH_STATIC__;

  const DEFAULT_PROFILE = {
    bestScore: 0,
    bestWave: 1,
    highestLevel: 1,
    totalKills: 0,
    runs: 0,
    notesDiscovered: [],
    lang: "vi",
    quality: "auto"
  };

  async function req(url, opts) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch {
      return null;
    }
  }

  function _fin(v, def) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  function sanitizeProfile(raw) {
    const r = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
    const notes = Array.isArray(r.notesDiscovered)
      ? Array.from(new Set(r.notesDiscovered.filter((x) => typeof x === "string" || typeof x === "number")))
      : [];
    return {
      bestScore: Math.max(0, _fin(r.bestScore, 0)),
      bestWave: Math.max(1, _fin(r.bestWave, 1)),
      highestLevel: Math.max(1, _fin(r.highestLevel, 1)),
      totalKills: Math.max(0, _fin(r.totalKills, 0)),
      runs: Math.max(0, _fin(r.runs, 0)),
      notesDiscovered: notes,
      lang: (r.lang === "en" || r.lang === "vi") ? r.lang : DEFAULT_PROFILE.lang,
      quality: (typeof r.quality === "string" && r.quality) ? r.quality : DEFAULT_PROFILE.quality
    };
  }

  function sanitizeLbEntry(x) {
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    const lv = Math.max(1, _fin(x.level, 0) > 0 ? _fin(x.level, 1) : (_fin(x.wave, 0) > 0 ? _fin(x.wave, 1) : 1));
    return {
      name: String(x.name || "Survivor").slice(0, 24),
      score: Math.max(0, _fin(x.score, 0)),
      wave: Math.max(1, _fin(x.wave, lv) > 0 ? _fin(x.wave, lv) : lv),
      level: lv,
      kills: Math.max(0, _fin(x.kills, 0)),
      win: !!x.win,
      date: typeof x.date === "string" ? x.date : new Date().toISOString().slice(0, 10)
    };
  }

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return Object.assign({}, DEFAULT_PROFILE);
      }
      return sanitizeProfile(Object.assign({}, DEFAULT_PROFILE, raw));
    } catch {
      return Object.assign({}, DEFAULT_PROFILE);
    }
  }

  function saveLocal(p) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(sanitizeProfile(p)));
    } catch {}
  }

  function mergeProfile(cur, body) {
    const c = sanitizeProfile(cur);
    const b = (body && typeof body === "object" && !Array.isArray(body)) ? body : {};
    const bScore = Math.max(0, _fin(b.score, 0), _fin(b.bestScore, 0));
    const bWave = Math.max(1, _fin(b.wave, 1), _fin(b.bestWave, 1), _fin(b.level, 1));
    const bHigh = Math.max(1, _fin(b.highestLevel, 1));
    const bKills = Math.max(0, _fin(b.killsDelta, 0));
    const curNotes = Array.isArray(c.notesDiscovered) ? c.notesDiscovered : [];
    const bNotes1 = Array.isArray(b.notes) ? b.notes.filter((x) => typeof x === "string" || typeof x === "number") : [];
    const bNotes2 = Array.isArray(b.notesDiscovered) ? b.notesDiscovered.filter((x) => typeof x === "string" || typeof x === "number") : [];
    return {
      bestScore: Math.max(c.bestScore, bScore),
      bestWave: Math.max(c.bestWave, bWave),
      highestLevel: Math.max(c.highestLevel, bHigh),
      totalKills: Math.max(0, c.totalKills + bKills),
      runs: Math.max(0, c.runs + (b.completedRun ? 1 : 0)),
      notesDiscovered: Array.from(new Set([...curNotes, ...bNotes1, ...bNotes2])),
      lang: (b.lang === "en" || b.lang === "vi") ? b.lang : c.lang,
      quality: (typeof b.quality === "string" && b.quality) ? b.quality : c.quality
    };
  }

  function loadLocalLb() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_LB_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        const clean = sanitizeLbEntry(raw[i]);
        if (clean) out.push(clean);
      }
      return out;
    } catch {
      return [];
    }
  }

  function saveLocalLb(list) {
    try {
      const arr = Array.isArray(list) ? list.map(sanitizeLbEntry).filter(Boolean) : [];
      localStorage.setItem(LS_LB_KEY, JSON.stringify(arr));
    } catch {}
  }

  return {
    async loadProfile() {
      if (IS_STATIC) return loadLocal();
      const srv = await req("api/profile");
      if (srv && typeof srv === "object" && !Array.isArray(srv)) {
        const merged = sanitizeProfile(Object.assign({}, DEFAULT_PROFILE, srv));
        saveLocal(merged);
        return merged;
      }
      return loadLocal();
    },

    async saveProfile(patch) {
      const updated = mergeProfile(loadLocal(), patch);
      saveLocal(updated);
      if (IS_STATIC) return updated;
      const srv = await req("api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (srv && typeof srv === "object" && !Array.isArray(srv)) {
        const merged = sanitizeProfile(Object.assign({}, DEFAULT_PROFILE, srv));
        saveLocal(merged);
        return merged;
      }
      return updated;
    },

    async loadLeaderboard() {
      if (IS_STATIC) return loadLocalLb();
      const srv = await req("api/leaderboard");
      if (Array.isArray(srv)) return srv.map(sanitizeLbEntry).filter(Boolean);
      return loadLocalLb();
    },

    async submitScore(entry) {
      const e = (entry && typeof entry === "object" && !Array.isArray(entry)) ? entry : {};
      const lv = Math.max(1, _fin(e.level, 0) > 0 ? _fin(e.level, 1) : (_fin(e.wave, 0) > 0 ? _fin(e.wave, 1) : 1));
      const list = loadLocalLb();
      list.push({
        name: String(e.name || "Survivor").slice(0, 24),
        score: Math.max(0, _fin(e.score, 0)),
        wave: lv,
        level: lv,
        kills: Math.max(0, _fin(e.kills, 0)),
        win: !!e.win,
        date: new Date().toISOString().slice(0, 10)
      });
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
      const top = list.slice(0, 10);
      saveLocalLb(top);
      if (IS_STATIC) return top;
      const srv = await req("api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e)
      });
      if (Array.isArray(srv)) {
        const cleanSrv = srv.map(sanitizeLbEntry).filter(Boolean);
        saveLocalLb(cleanSrv);
        return cleanSrv;
      }
      return top;
    }
  };
})();
