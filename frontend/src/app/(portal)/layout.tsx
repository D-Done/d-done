"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/api";
import { ROUTE_LOGIN, ROUTE_LOGIN_SESSION_INVALID } from "@/lib/constants";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getMe().then((me) => {
      if (!me) { router.push(ROUTE_LOGIN_SESSION_INVALID); return; }
      if (me.approval_status !== "approved") { router.push("/pending-approval"); return; }
      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
