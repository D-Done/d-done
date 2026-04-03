"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getInviteCookie, clearInviteCookie } from "@/lib/invite-cookie";

/** OAuth callback URL — check for pending invite before redirecting. */
export default function LoginCallbackPage() {
  const router = useRouter();
  useEffect(() => {
    const pendingInvite = getInviteCookie();
    if (pendingInvite) {
      clearInviteCookie();
      router.replace(`/invite?token=${encodeURIComponent(pendingInvite)}`);
      return;
    }
    router.replace("/login");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">מפנה להתחברות…</p>
    </div>
  );
}
