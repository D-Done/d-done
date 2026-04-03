"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useRouter } from "next/navigation";
import { useSession, useUser } from "@descope/nextjs-sdk/client";
import { FileSearch } from "lucide-react";

import { ApiError, createBackendSession } from "@/lib/api";
import { getInviteCookie, clearInviteCookie } from "@/lib/invite-cookie";
import {
  inferProviderFromDescopeEvent,
  inferProviderFromLoginIds,
} from "@/lib/descope-provider";
import {
  buildInviteRoute,
  DESCOPE_FLOW_SIGN_UP_OR_IN,
  ERROR_INVITATION_REQUIRED,
  ROUTE_DASHBOARD,
} from "@/lib/constants";

function LoginContent() {
  const router = useRouter();
  const { isAuthenticated, isSessionLoading, sessionToken } = useSession();
  const { user: descopeUser } = useUser();
  const [DescopeComponent, setDescopeComponent] =
    useState<ComponentType<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const lastSyncedToken = useRef<string | null>(null);
  const detectedProvider = useRef<string | null>(null);

  useEffect(() => {
    import("@descope/react-sdk").then((mod) => {
      if (mod.Descope) {
        setDescopeComponent(
          mod.Descope as unknown as ComponentType<Record<string, unknown>>,
        );
      }
    });
  }, []);

  useEffect(() => {
    const pendingInvite = getInviteCookie();
    if (pendingInvite) {
      clearInviteCookie();
      router.replace(buildInviteRoute(pendingInvite));
      return;
    }

    if (isSessionLoading || !isAuthenticated || !sessionToken) return;
    if (lastSyncedToken.current === sessionToken) return;
    lastSyncedToken.current = sessionToken;
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
          providerHint: provider ?? undefined,
        });
        router.replace(ROUTE_DASHBOARD);
      } catch (e) {
        lastSyncedToken.current = null;
        if (e instanceof ApiError && e.status === 403) {
          if (e.message === ERROR_INVITATION_REQUIRED) {
            setError(
              "גישה בהזמנה בלבד. אנא השתמש/י בקישור ההזמנה שנשלח למייל.",
            );
          } else {
            setError(e.message || "הגישה נדחתה.");
          }
        } else {
          setError("לא ניתן להשלים את ההתחברות. נסה שוב.");
        }
      } finally {
        setSyncing(false);
      }
    })();
  }, [isAuthenticated, isSessionLoading, sessionToken, router]);

  function handleError() {
    setError("ההתחברות נכשלה. אנא נסה שנית.");
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
          <FileSearch className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          ברוכים הבאים ל-D-Done
        </h1>
        <p className="text-muted-foreground text-sm mt-1.5">
          פלטפורמת בדיקת נאותות חכמה לעורכי דין בתחום הנדל&quot;ן
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        {syncing && (
          <div className="mb-4 text-center text-sm text-muted-foreground">
            משלים התחברות…
          </div>
        )}

        {DescopeComponent ? (
          <div className="descope-login-wrapper">
            <DescopeComponent
              flowId={DESCOPE_FLOW_SIGN_UP_OR_IN}
              onSuccess={(e: CustomEvent) => {
                detectedProvider.current =
                  inferProviderFromDescopeEvent(e?.detail) ?? null;
                setError(null);
              }}
              onError={handleError}
            />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        בהתחברות אתה מסכים ל
        <span className="text-primary cursor-pointer hover:underline">
          תנאי השימוש
        </span>{" "}
        ול
        <span className="text-primary cursor-pointer hover:underline">
          מדיניות הפרטיות
        </span>
      </p>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <div className="mx-auto mb-4 flex h-14 w-14 animate-pulse rounded-xl bg-primary/20" />
        <div className="h-7 w-48 mx-auto animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 mx-auto mt-2 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-3">
          <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
          <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
      <Suspense fallback={<LoginFallback />}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
