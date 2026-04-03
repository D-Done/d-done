"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDescope, useSession, useUser } from "@descope/nextjs-sdk/client";
import { FileSearch, Loader2 } from "lucide-react";

import {
  ApiError,
  createBackendSession,
  logoutSession,
  previewInvite,
  type InvitePreviewResponse,
} from "@/lib/api";
import { setInviteCookie, getInviteCookie, clearInviteCookie } from "@/lib/invite-cookie";
import {
  inferProviderFromDescopeEvent,
  inferProviderFromLoginIds,
} from "@/lib/descope-provider";
import {
  DESCOPE_FLOW_SIGN_UP_OR_IN,
  INVITE_REASON_ALREADY_USED,
  INVITE_REASON_EXPIRED,
  INVITE_REASON_INVALID,
  INVITE_REASON_REVOKED,
  ROUTE_DASHBOARD,
  ROUTE_LOGIN,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";

function reasonMessage(reason: string): string {
  switch (reason) {
    case INVITE_REASON_EXPIRED:
      return "תוקף ההזמנה פג.";
    case INVITE_REASON_REVOKED:
      return "ההזמנה בוטלה.";
    case INVITE_REASON_ALREADY_USED:
      return "ההזמנה כבר נוצלה.";
    case INVITE_REASON_INVALID:
      return "קישור ההזמנה אינו תקף.";
    default:
      return "לא ניתן להשתמש בהזמנה זו.";
  }
}

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawToken = searchParams.get("token")?.trim() ?? "";

  const { isAuthenticated, isSessionLoading, sessionToken } = useSession();
  const { user: descopeUser } = useUser();
  const descope = useDescope();

  const [DescopeComponent, setDescopeComponent] = useState<ComponentType<
    Record<string, unknown>
  > | null>(null);
  const [preview, setPreview] = useState<InvitePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [showWidget, setShowWidget] = useState(false);
  const [readyToSync, setReadyToSync] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncDone = useRef(false);
  const detectedProvider = useRef<string | null>(null);

  // Load Descope component
  useEffect(() => {
    import("@descope/react-sdk").then((mod) => {
      if (mod.Descope) {
        setDescopeComponent(
          mod.Descope as unknown as ComponentType<Record<string, unknown>>,
        );
      }
    });
  }, []);

  // Preview invite token
  useEffect(() => {
    if (!rawToken) {
      setPreview({ valid: false, reason: "invalid" });
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await previewInvite(rawToken);
        if (!cancelled) setPreview(res);
      } catch {
        if (!cancelled) setPreview({ valid: false, reason: INVITE_REASON_INVALID });
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawToken]);

  // Detect return from OAuth redirect: cookie has our invite token
  // and Descope session is now active.
  useEffect(() => {
    if (isSessionLoading || syncDone.current || !rawToken) return;
    const cookieToken = getInviteCookie();
    if (cookieToken === rawToken && isAuthenticated && sessionToken) {
      clearInviteCookie();
      setReadyToSync(true);
    }
  }, [isSessionLoading, isAuthenticated, sessionToken, rawToken]);

  // Unified sync: fires when readyToSync + sessionToken available
  useEffect(() => {
    if (!readyToSync || !sessionToken || syncDone.current) return;
    syncDone.current = true;
    setSyncing(true);
    setError(null);
    (async () => {
      try {
        const provider =
          detectedProvider.current ??
          inferProviderFromLoginIds(
            descopeUser?.loginIds as string[] | undefined,
          );
        await createBackendSession({
          descopeToken: sessionToken,
          inviteToken: rawToken,
          providerHint: provider ?? undefined,
        });
        clearInviteCookie();
        router.replace(ROUTE_DASHBOARD);
      } catch (e) {
        syncDone.current = false;
        setReadyToSync(false);
        if (e instanceof ApiError) {
          setError(e.message || "ההרשמה נכשלה.");
        } else {
          setError("ההרשמה נכשלה. נסה שוב.");
        }
      } finally {
        setSyncing(false);
      }
    })();
  }, [readyToSync, sessionToken, rawToken, router]);

  // Click "התחברות": set cookie, clear all stale sessions, show widget
  const handleStartAuth = useCallback(async () => {
    setInviteCookie(rawToken);
    await logoutSession().catch(() => {});
    await descope.logout().catch(() => {});
    setShowWidget(true);
  }, [descope, rawToken]);

  // Descope widget onSuccess (for non-redirect auth)
  const handleDescopeSuccess = useCallback((e?: CustomEvent) => {
    detectedProvider.current =
      inferProviderFromDescopeEvent(e?.detail) ?? null;
    setError(null);
    setReadyToSync(true);
  }, []);

  // --- Render ---

  if (!rawToken) {
    return (
      <div className="w-full max-w-md text-center space-y-4" dir="rtl">
        <p className="text-destructive">
          חסר קישור הזמנה. פתח/י את הקישור מהמייל.
        </p>
        <Button variant="outline" onClick={() => router.push(ROUTE_LOGIN)}>
          מעבר להתחברות
        </Button>
      </div>
    );
  }

  if (previewLoading) {
    return (
      <div className="flex flex-col items-center gap-4" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">בודקים את ההזמנה…</p>
      </div>
    );
  }

  if (!preview?.valid) {
    return (
      <div className="w-full max-w-md text-center space-y-4" dir="rtl">
        <p className="text-destructive">
          {reasonMessage(
            preview && "reason" in preview ? preview.reason : "invalid",
          )}
        </p>
        <Button variant="outline" onClick={() => router.push(ROUTE_LOGIN)}>
          מעבר להתחברות
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm" dir="rtl">
      <div className="text-center mb-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
          <FileSearch className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">הצטרפות ל-D-Done</h1>
        {preview.orgName && (
          <p className="text-muted-foreground text-sm mt-2">
            ארגון: <strong>{preview.orgName}</strong>
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        {syncing && (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm text-muted-foreground">משלים הרשמה…</p>
          </div>
        )}

        {!showWidget && !syncing && (
          <>
            <p className="text-sm text-center text-muted-foreground">
              התחבר/י כדי להשלים את ההרשמה.
            </p>
            <Button className="w-full" onClick={handleStartAuth}>
              התחברות
            </Button>
          </>
        )}

        {showWidget && !syncing && DescopeComponent && (
          <div className="descope-login-wrapper">
            <DescopeComponent
              flowId={DESCOPE_FLOW_SIGN_UP_OR_IN}
              onSuccess={(e: CustomEvent) => handleDescopeSuccess(e)}
              onError={() => setError("ההתחברות נכשלה. נסה שנית.")}
            />
          </div>
        )}

        {showWidget && !syncing && !DescopeComponent && (
          <div className="space-y-3 py-2">
            <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
          </div>
        )}
      </div>
    </div>
  );
}

function InviteFallback() {
  return (
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function InvitePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-background to-muted/40 p-4">
      <Suspense fallback={<InviteFallback />}>
        <InviteContent />
      </Suspense>
    </div>
  );
}
