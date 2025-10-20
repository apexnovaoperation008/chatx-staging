// src/lib/authRefresher.ts
const API_URL = process.env.NEXT_PUBLIC_API_BASE;
let refreshInterval: NodeJS.Timeout | null = null;

/**
 * Start automatic silent refresh every X minutes.
 * @param intervalMinutes how often to refresh (e.g. 14 if access = 15 min)
 */
export function startTokenAutoRefresh(intervalMinutes = 15) {
  stopTokenAutoRefresh(); // ensure no duplicate timers

  console.log(`🔁 Starting auto-refresh every ${intervalMinutes} min...`);

  refreshInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        console.log("🟢 Silent token refresh successful");
      } else {
        console.warn("🔴 Refresh failed, likely expired");
        stopTokenAutoRefresh();
        // optional: import handleSessionExpired and redirect here
      }
    } catch (err) {
      console.error("Error in auto refresh:", err);
      stopTokenAutoRefresh();
    }
  }, intervalMinutes * 60 * 1000);
}

/** Stop background refresh (on logout or tab close) */
export function stopTokenAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log("⏹️ Auto-refresh stopped");
  }
}
