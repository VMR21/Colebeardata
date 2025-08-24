import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = "https://themahjongmandata.onrender.com/leaderboard/top14";
const API_KEY = "k4j4j3Yk7e9BePgYg2cAmlsUC8WGNC5f";

let cachedData = [];

// ====== CYCLE CONFIG ======
const BASE_START = Date.UTC(2025, 7, 11, 0, 0, 0); // 11 Aug 2025 00:00:00 UTC
const CYCLE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ---------- helpers ----------
function maskUsername(username = "") {
  if (username.length <= 4) return username;
  return (
    username.slice(0, 2) + "***" + username.slice(-2) // Po***es style
  );
}
function ymdUTC(date) {
  return date.toISOString().slice(0, 10);
}
function getCycle(offset = 0, nowMs = Date.now()) {
  const k = Math.floor((nowMs - BASE_START) / CYCLE_MS) + offset;
  const start = new Date(BASE_START + k * CYCLE_MS);
  const end = new Date(start.getTime() + CYCLE_MS - 1);
  return { start, end };
}
function buildUrl(start, end) {
  return `https://services.rainbet.com/v1/external/affiliates?start_at=${ymdUTC(
    start
  )}&end_at=${ymdUTC(end)}&key=${API_KEY}`;
}

async function fetchWindow(start, end) {
  const url = buildUrl(start, end);
  console.log(`[🌐] Fetching: ${url}`);

  const res = await fetch(url);
  const json = await res.json();
  if (!json.affiliates) return [];

  const sorted = json.affiliates.sort(
    (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
  );
  const top10 = sorted.slice(0, 10);

  return top10.map((e) => ({
    username: maskUsername(e.username),
    wagered: Math.round(parseFloat(e.wagered_amount)),
    weightedWager: Math.round(parseFloat(e.wagered_amount)),
  }));
}

async function fetchAndCache() {
  try {
    const { start, end } = getCycle(0);
    cachedData = await fetchWindow(start, end);
    console.log(`[✅] Cached ${ymdUTC(start)} → ${ymdUTC(end)}`);
  } catch (e) {
    console.error("[❌] Update failed:", e.message);
  }
}
fetchAndCache();
setInterval(fetchAndCache, 5 * 60 * 1000);

// Routes
app.get("/leaderboard/top14", (req, res) => res.json(cachedData));

app.get("/leaderboard/prev", async (req, res) => {
  try {
    const { start, end } = getCycle(-1);
    if (end.getTime() < BASE_START) return res.json([]);
    const data = await fetchWindow(start, end);
    res.json(data);
  } catch (e) {
    console.error("[❌] Prev failed:", e.message);
    res.status(500).json({ error: "Failed to fetch previous data" });
  }
});

// Keep-alive
setInterval(() => {
  fetch(SELF_URL).catch(() => {});
}, 270000);

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
