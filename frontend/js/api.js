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

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      return raw ? Object.assign({}, DEFAULT_PROFILE, raw) : Object.assign({}, DEFAULT_PROFILE);
    } catch {
      return Object.assign({}, DEFAULT_PROFILE);
    }
  }

  function saveLocal(p) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p));
    } catch {}
  }

  function mergeProfile(cur, body) {
    const b = body || {};
    return {
      bestScore: Math.max(cur.bestScore || 0, Number(b.score) || Number(b.bestScore) || 0),
      bestWave: Math.max(cur.bestWave || 1, Number(b.wave) || Number(b.bestWave) || Number(b.level) || 1),
      highestLevel: Math.max(cur.highestLevel || 1, Number(b.highestLevel) || 1),
      totalKills: (cur.totalKills || 0) + (Number(b.killsDelta) || 0),
      runs: (cur.runs || 0) + (b.completedRun ? 1 : 0),
      notesDiscovered: Array.from(new Set([
        ...(cur.notesDiscovered || []),
        ...(Array.isArray(b.notes) ? b.notes : []),
        ...(Array.isArray(b.notesDiscovered) ? b.notesDiscovered : [])
      ])),
      lang: b.lang || cur.lang || "vi",
      quality: b.quality || cur.quality || "auto"
    };
  }

  function loadLocalLb() {
    try {
      return JSON.parse(localStorage.getItem(LS_LB_KEY) || "[]") || [];
    } catch {
      return [];
    }
  }

  function saveLocalLb(list) {
    try {
      localStorage.setItem(LS_LB_KEY, JSON.stringify(list));
    } catch {}
  }

  return {
    async loadProfile() {
      if (IS_STATIC) return loadLocal();
      const srv = await req("api/profile");
      if (srv) {
        const merged = Object.assign({}, DEFAULT_PROFILE, srv);
        merged.highestLevel = Math.max(1, Number(merged.highestLevel) || 1);
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
      if (srv) {
        const merged = Object.assign({}, DEFAULT_PROFILE, srv);
        merged.highestLevel = Math.max(1, Number(merged.highestLevel) || 1);
        saveLocal(merged);
        return merged;
      }
      return updated;
    },

    async loadLeaderboard() {
      if (IS_STATIC) return loadLocalLb();
      return (await req("api/leaderboard")) || loadLocalLb();
    },

    async submitScore(entry) {
      const e = entry || {};
      const lv = Number(e.level) || Number(e.wave) || 1;
      const list = loadLocalLb();
      list.push({
        name: String(e.name || "Survivor").slice(0, 24),
        score: Number(e.score) || 0,
        wave: lv,
        level: lv,
        kills: Number(e.kills) || 0,
        win: !!e.win,
        date: new Date().toISOString().slice(0, 10)
      });
      list.sort((a, b) => b.score - a.score);
      const top = list.slice(0, 10);
      saveLocalLb(top);
      if (IS_STATIC) return top;
      const srv = await req("api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e)
      });
      if (srv) {
        saveLocalLb(srv);
        return srv;
      }
      return top;
    }
  };
})();
