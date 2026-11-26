"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const PORT = parseInt(process.env.PORT || "8766", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".ttf": "font/ttf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav"
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), "utf8");
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 262144) req.destroy();
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}

async function handleApi(req, res, apiPath) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }
  if (apiPath === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, game: "fps-zombie-suong-mu", version: "v9.0" });
  }
  if (apiPath === "/api/config" && req.method === "GET") {
    return sendJson(res, 200, readJson("config.json", {}));
  }
  if (apiPath === "/api/profile" && req.method === "GET") {
    const prof = readJson("profile.json", {});
    if (prof.highestLevel === undefined) prof.highestLevel = 1;
    return sendJson(res, 200, prof);
  }
  if (apiPath === "/api/profile" && req.method === "POST") {
    const body = await readBody(req);
    const cur = readJson("profile.json", {});
    const updated = {
      bestScore: Math.max(cur.bestScore || 0, Number(body.score) || Number(body.bestScore) || 0),
      bestWave: Math.max(cur.bestWave || 1, Number(body.wave) || Number(body.bestWave) || Number(body.level) || 1),
      highestLevel: Math.max(cur.highestLevel || 1, Number(body.highestLevel) || 1),
      totalKills: (cur.totalKills || 0) + (Number(body.killsDelta) || 0),
      runs: (cur.runs || 0) + (body.completedRun ? 1 : 0),
      notesDiscovered: Array.from(new Set([
        ...(cur.notesDiscovered || []),
        ...(Array.isArray(body.notes) ? body.notes : []),
        ...(Array.isArray(body.notesDiscovered) ? body.notesDiscovered : [])
      ])),
      lang: body.lang || cur.lang || "vi",
      quality: body.quality || cur.quality || "auto"
    };
    writeJson("profile.json", updated);
    return sendJson(res, 200, updated);
  }
  if (apiPath === "/api/leaderboard" && req.method === "GET") {
    return sendJson(res, 200, readJson("leaderboard.json", []));
  }
  if (apiPath === "/api/leaderboard" && req.method === "POST") {
    const body = await readBody(req);
    const list = readJson("leaderboard.json", []);
    const lv = Number(body.level) || Number(body.wave) || 1;
    list.push({
      name: String(body.name || "Survivor").slice(0, 24),
      score: Number(body.score) || 0,
      wave: lv,
      level: lv,
      kills: Number(body.kills) || 0,
      win: !!body.win,
      date: new Date().toISOString().slice(0, 10)
    });
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, 10);
    writeJson("leaderboard.json", top);
    return sendJson(res, 200, top);
  }
  return sendJson(res, 404, { error: "Not found" });
}

function serveStatic(req, res, pathname) {
  let cleanPath = decodeURIComponent(pathname.split("?")[0]);
  if (cleanPath === "/") cleanPath = "/index.html";
  const filePath = path.normalize(path.join(ROOT_DIR, cleanPath));
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end("Not found"); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const headers = {
      "Content-Type": mime,
      "Cache-Control": ext === ".glb" || ext === ".ttf" || ext === ".jpg" ? "public, max-age=86400" : "no-cache"
    };
    const ae = req.headers["accept-encoding"] || "";
    const compressible = /\.(html|css|js|json|glb|ttf)$/.test(ext);
    if (compressible && ae.includes("gzip") && stat.size > 1024) {
      headers["Content-Encoding"] = "gzip";
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(zlib.createGzip({ level: 4 })).pipe(res);
    } else {
      headers["Content-Length"] = stat.size;
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

if (require.main === module) {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || "/").split("?")[0];
    if (urlPath.startsWith("/api/")) return handleApi(req, res, urlPath);
    return serveStatic(req, res, urlPath);
  });
  server.listen(PORT, () => console.log(`FPS Zombie Backend listening on http://localhost:${PORT}`));
}

module.exports = { handleApi, serveStatic, ROOT_DIR };
