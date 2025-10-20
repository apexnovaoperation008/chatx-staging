// src/utils/cookieOptions.ts
import { CookieOptions } from "express";

export function getCookieOptions(
  maxAgeMs: number,
  { crossDomain = false, isRefresh = false }: { crossDomain?: boolean; isRefresh?: boolean } = {}
): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    return {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: maxAgeMs,
      path: "/", // you can also set `/auth/refresh` if isRefresh is true
    };
  }

  return {
    httpOnly: true,
    secure: true,
    sameSite: crossDomain ? "none" : "strict",
    maxAge: maxAgeMs,
    path: isRefresh ? "/auth/refresh" : "/",
  };
}
