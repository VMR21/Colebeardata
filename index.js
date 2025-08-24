import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Keep your own public URL if needed for Render keep-alive pings
const SELF_URL = "https://colebeardata.onrender.com/leaderboard/top14";
const API_KEY = "rKCvnPfyGUNl0W6Gj17uaKaHyY3jIilI";

// ====== CYCLE CONFIG (UTC) ======
const BASE_START_UTC = new Date(Date.UTC(2025, 7, 11, 0, 0, 0)); // 11 Aug 2025 00:00:00 UTC
const CYCLE_MS = 14 * 24 * 60 * 60 * 1000;                       // 14 days

let cachedData = [];

// ✅ CORS headers manually
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ---------- helpers ----------
function maskUsername(username) {
  if (!username) return "";
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}

function ymdUTC(date) {
  // Format YYYY-MM-DD in UTC
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns { startDate, endDate } (both Date objects in UTC)
 * for the cycle that is `offset` away from NOW:
 *  - offset = 0 → current cycle
 *  - offset = -1 → previous cycle
 *  - offset = +1 → next cycle
 */
function getCycleBounds(offset = 0, now = new Date()) {
  // If now is before base start, clamp to the first cycle (k = 0)
  const elapsed = Math.max(0, now.getTime() - BASE_START_UTC.getTime());
  const k = Math.floor(elapsed / CYCLE_MS) + offset;

  const idx = Math.max(0, k); // don’t allow negative cycles
  const startDate = new Date(BASE_START_UTC.getTime() + idx * CYCLE_MS);
  const endDate = new Date(startDate.getTime() + CYCLE_MS - 1); // inclusive end
  return { startDate, endDate };
}

function buildRainbetUrl(startDate, endDate) {
  // Rainbet endpoint appears to accept YYYY-MM-DD inclusive
  const startStr = ymdUTC(startDate);
  const endStr = ymdUTC(endDate); // inclusive last day
  return `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${API_KEY}`;
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
  if (top10.length >= 2) {
    // keep your “swap top 2” quirk
    [top10[0], top10[1]] = [top10[1], top10[0]];
  }

  return top10.map((entry) => ({
    username: maskUsername(entry.username),
    wagered: Math.round(parseFloat(entry.wagered_amount)),
    weightedWager: Math.round(parseFloat(entry.wagered_amount)),
  }));
}

// ---------- caching current cycle ----------
async function fetchAndCacheData() {
  try {
    const { startDate, endDate } = getCycleBounds(0, new Date());
    const data = await getTop10ForWindow(startDate, endDate);
    cachedData = data;
    console.log(
      `[✅] Leaderboard updated for ${ymdUTC(startDate)} → ${ymdUTC(endDate)}`
    );
  } catch (err) {
    console.error("[❌] Failed to fetch Rainbet data:", err.message);
  }
}

// initial + every 5 minutes
fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000);

// ---------- routes ----------
app.get("/leaderboard/top14", (req, res) => {
  // current cycle (served from cache)
  res.json(cachedData);
});

app.get("/leaderboard/prev", async (req, res) => {
  try {
    // previous 14-day cycle
    const { startDate, endDate } = getCycleBounds(-1, new Date());
    // If we are still before the first cycle, return empty
    if (endDate.getTime() < BASE_START_UTC.getTime()) {
      return res.json([]);
    }

    const data = await getTop10ForWindow(startDate, endDate);
    res.json(data);
  } catch (err) {
    console.error("[❌] Failed to fetch previous leaderboard:", err.message);
    res.status(500).json({ error: "Failed to fetch previous leaderboard data." });
  }
});

// ---------- keep-alive for Render (optional) ----------
setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log(`[🔁] Self-pinged ${SELF_URL}`))
    .catch((err) => console.error("[⚠️] Self-ping failed:", err.message));
}, 270000); // every 4.5 mins

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
