export type DescopeUser = { email: string; name: string | null };

export async function verifyDescopeToken(token: string): Promise<DescopeUser | null> {
  if (!token) return null;
  try {
    const res = await fetch("https://api.descope.com/oauth2/v1/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.email) return null;
    return { email: (d.email as string).toLowerCase(), name: d.name ?? null };
  } catch {
    return null;
  }
}
