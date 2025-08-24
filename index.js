import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = "https://colebeardata.onrender.com/leaderboard/top14";
const API_KEY = "rKCvnPfyGUNl0W6Gj17uaKaHyY3jIilI";

// Cache to avoid hitting API on every request
let cachedData = [];
let cachedPrevData = [];

// ===== UTILITIES =====
function maskUsername(username = "") {
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}

function ymdUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get the current and previous 14-day bounds
 */
function getCycleBounds(now = new Date()) {
  const d = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  // Define "anchor" days for cycles
  let start;
  if (d.getUTCDate() >= 11 && d.getUTCDate() <= 24) {
    start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 11));
  } else if (d.getUTCDate() >= 25) {
    start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 25));
  } else {
    // Before 11 → belongs to the last cycle (25 prev month → 10 this month)
    const prevMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 25));
    start = prevMonth;
  }

  const end = new Date(start.getTime());
  end.setUTCDate(start.getUTCDate() + 13); // 14 days inclusive

  // Previous cycle = just subtract 14 days
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime());
  prevStart.setUTCDate(prevEnd.getUTCDate() - 13);

  return {
    current: { start, end },
    prev: { start: prevStart, end: prevEnd }
  };
}

/**
 * Fetch leaderboard data for a given start/end
 */
async function fetchLeaderboard(startDate, endDate) {
  const url = `https://services.rainbet.com/v1/external/affiliates?start_at=${ymdUTC(startDate)}&end_at=${ymdUTC(endDate)}&key=${API_KEY}`;
  console.log(`[➡️] Fetch: ${url}`);

  const response = await fetch(url);
  const json = await response.json();

  if (!json.affiliates) return [];

  // Sort by wagered
  const sorted = json.affiliates.sort(
    (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
  );

  // Get top 10
  const top10 = sorted.slice(0, 10);

  // Swap rank 1 and 2 if needed
  if (top10.length >= 2) [top10[0], top10[1]] = [top10[1], top10[0]];

  // Return formatted
  return top10.map(entry => ({
    username: maskUsername(entry.username),
    wagered: Math.round(parseFloat(entry.wagered_amount)),
    weightedWager: Math.round(parseFloat(entry.wagered_amount))
  }));
}

// ===== REFRESH CACHES =====
async function refreshCaches() {
  try {
    const { current, prev } = getCycleBounds();

    cachedData = await fetchLeaderboard(current.start, current.end);
    cachedPrevData = await fetchLeaderboard(prev.start, prev.end);

    console.log("[✅] Leaderboards updated");
  } catch (err) {
    console.error("[❌] Failed refreshing caches:", err.message);
  }
}
refreshCaches();
setInterval(refreshCaches, 5 * 60 * 1000); // every 5 min

// ===== ROUTES =====
app.get("/leaderboard/top14", (req, res) => {
  res.json(cachedData);
});

app.get("/leaderboard/prev", (req, res) => {
  res.json(cachedPrevData);
});

// Keep-alive
setInterval(() => {
  fetch(SELF_URL).then(() => console.log(`[🔁] Self-ping`));
}, 270000);

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
