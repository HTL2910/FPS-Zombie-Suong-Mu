"use strict";
window.FPSApi = (function(){
  const LS_KEY = "fps_zombie_profile_v7";
  async function req(url, opts){
    try {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch { return null; }
  }
  return {
    async loadProfile(){
      const srv = await req("api/profile");
      if (srv) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(srv)); } catch {}
        return srv;
      }
      try { return JSON.parse(localStorage.getItem(LS_KEY) || "null") || {}; }
      catch { return {}; }
    },
    async saveProfile(patch){
      try {
        const cur = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {};
        localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...patch }));
      } catch {}
      return await req("api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
    },
    async loadLeaderboard(){
      return (await req("api/leaderboard")) || [];
    },
    async submitScore(entry){
      return (await req("api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      })) || [];
    }
  };
})();
