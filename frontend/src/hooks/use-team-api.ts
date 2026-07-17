"use client";

import { useCallback } from "react";
import { useSession } from "@descope/nextjs-sdk/client";

export function useTeamApi() {
  const { sessionToken } = useSession();

  const api = useCallback(async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    const res = await fetch(`/api/team${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const err = new Error((d as { detail?: string; error?: string }).detail ?? (d as { error?: string }).error ?? "שגיאה");
      (err as Error & { status: number }).status = res.status;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }, [sessionToken]);

  return { api, sessionToken };
}
