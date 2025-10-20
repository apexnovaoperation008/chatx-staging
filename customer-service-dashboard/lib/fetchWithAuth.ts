// lib/fetchWithAuth.ts
import { handleSessionExpired } from "@/lib/handleSessionExpired";

const API_URL = process.env.NEXT_PUBLIC_API_BASE;

let isHandlingExpiry = false;
let refreshInProgress: Promise<boolean> | null = null;

/**
 * Fetch with automatic cookie-based authentication.
 * Automatically refreshes access token if expired (401).
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const fetchOptions: RequestInit = {
    ...options,
    credentials: "include", // 🔥 ensures access & refresh cookies are sent
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  };

  try {
    let res = await fetch(url, fetchOptions);

    if (res.status === 401) {
      // If refresh is already happening, just wait for it
      if (isHandlingExpiry && refreshInProgress) {
        console.log("⏳ Waiting for ongoing token refresh...");
        const refreshSuccess = await refreshInProgress;
        if (refreshSuccess) {
          console.log("🔁 Refresh completed, retrying request...");
          return await fetch(url, fetchOptions);
        } else {
          console.warn("⚠️ Refresh failed during concurrent wait.");
          handleSessionExpired();
          throw new Error("UNAUTHORIZED");
        }
      }
    
      isHandlingExpiry = true;
    
      if (!refreshInProgress) {
        refreshInProgress = attemptTokenRefresh();
      }
    
      const refreshSuccess = await refreshInProgress;
      refreshInProgress = null;
      isHandlingExpiry = false;
    
      if (!refreshSuccess) {
        console.warn("⚠️ Both tokens expired. Logging out.");
        handleSessionExpired();
        throw new Error("UNAUTHORIZED");
      }
    
      console.log("🔁 Token refreshed silently. Retrying request...");
      res = await fetch(url, fetchOptions);
    }
    

    return res;
  } catch (error: any) {
    console.error("Fetch with auth error:", error);
    throw error;
  }
}

/**
 * Attempt to refresh access token using refresh cookie.
 * Returns true if refresh succeeded, false if failed.
 */
async function attemptTokenRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include", // 🔥 send cookies for refresh
    });

    if (!res.ok) {
      console.error("🔴 Refresh token invalid or expired");
      return false;
    }

    console.log("🟢 Token refresh successful");
    return true;
  } catch (err) {
    console.error("Error refreshing token:", err);
    return false;
  }
}

// ✅ Call this after successful login or logout to reset internal state
export function resetAuthState() {
  isHandlingExpiry = false;
  refreshInProgress = null;
}
