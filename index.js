import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const SELF_URL = "https://colebeardata.onrender.com/leaderboard/top14";
const API_KEY = "rKCvnPfyGUNl0W6Gj17uaKaHyY3jIilI";

// ====== CYCLE CONFIG (strict UTC) ======
const BASE_START_MS = Date.UTC(2025, 7, 11, 0, 0, 0); // 11 Aug 2025 00:00:00 UTC
const CYCLE_MS = 14 * 24 * 60 * 60 * 1000;           // 14 days

let cachedData = [];

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ---------- helpers ----------
function maskUsername(u = "") {
  if (u.length <= 4) return u;
  return u.slice(0, 2) + "***" + u.slice(-2);
}
function ymdUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function cycleIndex(nowMs) {
  // floor handles negatives correctly
  return Math.floor((nowMs - BASE_START_MS) / CYCLE_MS);
}
/** returns { startDate, endDate, k } for offset cycle relative to NOW (UTC) */
function getCycleBounds(offset = 0, nowMs = Date.now()) {
  const k0 = cycleIndex(nowMs);
  const k = k0 + offset; // can be negative → before BASE_START
  const startMs = BASE_START_MS + k * CYCLE_MS;
  const endMs = startMs + CYCLE_MS - 1; // inclusive
  return { startDate: new Date(startMs), endDate: new Date(endMs), k };
}
function buildRainbetUrl(startDate, endDate) {
  return `https://services.rainbet.com/v1/external/affiliates?start_at=${ymdUTC(startDate)}&end_at=${ymdUTC(endDate)}&key=${API_KEY}`;
}
async function getTop10ForWindow(startDate, endDate) {
  const url = buildRainbetUrl(startDate, endDate);
  const resp = await fetch(url);
  const json = await resp.json();
  if (!json || !json.affiliates) throw new Error("No data");

  const sorted = json.affiliates.sort(
    (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
  );
  const top10 = sorted.slice(0, 10);
  if (top10.length >= 2) [top10[0], top10[1]] = [top10[1], top10[0]];

  return top10.map((e) => ({
    username: maskUsername(e.username),
    wagered: Math.round(parseFloat(e.wagered_amount)),
    weightedWager: Math.round(parseFloat(e.wagered_amount)),
  }));
}

// ---------- caching current cycle ----------
async function fetchAndCacheData() {
  try {
    const nowMs = Date.now(); // UTC epoch ms
    const k0 = cycleIndex(nowMs);
    if (k0 < 0) {
      cachedData = []; // before first cycle → no data yet
      console.log(`[ℹ] Before first cycle. Starts ${ymdUTC(new Date(BASE_START_MS))}`);
      return;
    }
    const { startDate, endDate } = getCycleBounds(0, nowMs);
    const data = await getTop10ForWindow(startDate, endDate);
    cachedData = data;
    console.log(`[✅] Cache for ${ymdUTC(startDate)} → ${ymdUTC(endDate)}`);
  } catch (err) {
    console.error("[❌] Update failed:", err.message);
  }
}
fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000);

// ---------- routes ----------
app.get("/leaderboard/top14", (req, res) => {
  res.json(cachedData);
});

app.get("/leaderboard/prev", async (req, res) => {
  try {
    const nowMs = Date.now();
    const { startDate, endDate, k } = getCycleBounds(-1, nowMs);
    // If previous cycle ends before base start → nothing to show
    if (endDate.getTime() < BASE_START_MS) return res.json([]);

    const data = await getTop10ForWindow(startDate, endDate);
    console.log(`[↩] Prev for k=${k}: ${ymdUTC(startDate)} → ${ymdUTC(endDate)}`);
    res.json(data);
  } catch (err) {
    console.error("[❌] Prev failed:", err.message);
    res.status(500).json({ error: "Failed to fetch previous leaderboard data." });
  }
});

// ---------- keep-alive ----------
setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log(`[🔁] Self-pinged ${SELF_URL}`))
    .catch((e) => console.error("[⚠️] Self-ping failed:", e.message));
}, 270000);

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
