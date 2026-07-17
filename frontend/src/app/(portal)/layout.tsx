"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@descope/nextjs-sdk/client";
import { getMe } from "@/lib/api";
import { ROUTE_LOGIN_SESSION_INVALID } from "@/lib/constants";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { sessionToken } = useSession();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getMe().then(async (me) => {
      if (!me) { router.push(ROUTE_LOGIN_SESSION_INVALID); return; }
      if (me.approval_status !== "approved") {
        // If they have team access, send them there instead of pending-approval
        try {
          const r = await fetch("/api/team/me", {
            headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
          });
          if (r.ok) { router.replace("/team-tasks"); return; }
        } catch { /* ignore */ }
        router.push("/pending-approval");
        return;
      }
      setReady(true);
    });
  }, [router, sessionToken]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
