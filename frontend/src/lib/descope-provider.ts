/**
 * Extract the OAuth provider from Descope user loginIds.
 *
 * With "Keep email as user attribute only" configured in Descope,
 * loginIds contain provider-prefixed identifiers like
 * "google-1234…" or "microsoft-5678…".
 */
import {
  LOGIN_ID_PREFIXES,
  PROVIDER_GOOGLE,
  PROVIDER_MICROSOFT,
} from "@/lib/constants";

export function inferProviderFromLoginIds(
  loginIds?: string[] | null,
): string | null {
  if (!loginIds || !Array.isArray(loginIds)) return null;
  for (const id of loginIds) {
    const lower = (id ?? "").toLowerCase();
    for (const [provider, prefix] of Object.entries(LOGIN_ID_PREFIXES)) {
      if (lower.startsWith(prefix)) return provider;
    }
  }
  return null;
}

/** Extract provider from a Descope onSuccess event detail. */
export function inferProviderFromDescopeEvent(
  detail: Record<string, unknown> | null | undefined,
): string | null {
  if (!detail) return null;
  const user = detail.user as Record<string, unknown> | undefined;
  if (user?.loginIds) {
    return inferProviderFromLoginIds(user.loginIds as string[]);
  }
  return null;
}

export { PROVIDER_GOOGLE, PROVIDER_MICROSOFT };
