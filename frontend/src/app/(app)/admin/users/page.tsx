"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Shield,
  ShieldOff,
  Clock,
  Loader2,
  MailPlus,
  Trash2,
  ScrollText,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminListUsers,
  adminSetAdmin,
  adminCreateInvitation,
  adminListInvitations,
  adminRevokeInvitation,
  adminDeleteUser,
  adminListAudit,
  getMe,
  type AdminUser,
  type AuditLogRow,
  type InvitationRow,
} from "@/lib/api";
import { PastelAvatar } from "@/components/pastel-avatar";
import {
  ROUTE_DASHBOARD,
} from "@/lib/constants";

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [invites, setInvites] = useState<InvitationRow[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [inviteActionLoading, setInviteActionLoading] = useState<string | null>(
    null,
  );
  const [meId, setMeId] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminListUsers();
      setUsers(res.users);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvites = useCallback(async () => {
    setInvitesLoading(true);
    try {
      const rows = await adminListInvitations();
      setInvites(rows);
    } catch {
      setInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await adminListAudit({ limit: 100, offset: 0 });
      setAuditRows(res.items);
      setAuditTotal(res.total);
    } catch {
      setAuditRows([]);
      setAuditTotal(0);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    getMe().then((me) => {
      if (!me || !me.is_admin) {
        router.replace(ROUTE_DASHBOARD);
        return;
      }
      setMeId(me.id);
      setIsAdmin(true);
    });
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
    fetchInvites();
    fetchAudit();
  }, [isAdmin, fetchUsers, fetchInvites, fetchAudit]);

  async function handleToggleAdmin(userId: string, currentIsAdmin: boolean) {
    setActionLoading(userId);
    try {
      await adminSetAdmin(userId, !currentIsAdmin);
      await fetchUsers();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviteLoading(true);
    try {
      const res = await adminCreateInvitation(email);
      if (res.email_sent) {
        toast.success(`ההזמנה נשלחה במייל ל־${email}`);
      } else {
        toast.warning(
          `ההזמנה נוצרה, אך המייל לא נשלח (בדוק Resend / EMAIL_FROM). קישור להעתקה בקונסול.`,
        );
      }
      if (res.invite_url) {
        console.info("Invite link:", res.invite_url);
      }
      setInviteEmail("");
      await fetchUsers();
      await fetchInvites();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "שגיאה בשליחת ההזמנה";
      toast.error(msg);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (
      !window.confirm(
        `להסיר גישה לצמיתות למשתמש ${email}? נתוני הפרויקטים יישארו; המשתמש לא יוכל להתחבר.`,
      )
    ) {
      return;
    }
    setActionLoading(userId);
    try {
      await adminDeleteUser(userId);
      toast.success("המשתמש הוסר מהמערכת");
      await fetchUsers();
      await fetchAudit();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "שגיאה בהסרת המשתמש";
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    setInviteActionLoading(invitationId);
    try {
      await adminRevokeInvitation(invitationId);
      toast.success("ההזמנה בוטלה");
      await fetchInvites();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "שגיאה בביטול ההזמנה";
      toast.error(msg);
    } finally {
      setInviteActionLoading(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ניהול משתמשים</h1>
          <p className="mt-1 text-sm text-slate-500">
            הזמן משתמשים במייל, נהל אדמינים ובטל הזמנות במידת הצורך
          </p>
        </div>

        {/* Invite by email — all invites use the Arnon organization (backend default) */}
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-4">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="invite-email" className="mb-1 block text-sm font-medium text-slate-700">
              הזמן משתמש במייל
            </label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              className="max-w-sm"
            />
          </div>
          <Button
            onClick={handleInvite}
            disabled={!inviteEmail.trim() || inviteLoading}
            className="gap-2"
          >
            {inviteLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MailPlus className="h-4 w-4" />
            )}
            שלח הזמנה
          </Button>
        </div>

        {/* Users table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            אין משתמשים בקטגוריה זו
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-right">
                  <th className="px-4 py-3 font-medium text-muted-foreground">משתמש</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">אימייל</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">ארגון</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">אדמין</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">סטטוס</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">תאריך הרשמה</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <PastelAvatar name={u.name} email={u.email} size="sm" />
                        <span className="font-medium text-slate-900">{u.name || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.organization_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_admin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                          <Shield className="h-3 w-3" /> אדמין
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_deleted ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          הוסר
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-700">פעיל</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("he-IL") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {actionLoading === u.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-violet-600 hover:bg-violet-50 hover:text-violet-700"
                              title={u.is_admin ? "הסר אדמין" : "הפוך לאדמין"}
                              onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                              disabled={u.is_deleted}
                            >
                              {u.is_admin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                              title="הסר גישה (מחיקה רכה)"
                              disabled={
                                u.is_deleted || meId === u.id || actionLoading === u.id
                              }
                              onClick={() => handleDeleteUser(u.id, u.email)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sent invitations */}
        <div className="rounded-xl border bg-white">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                הזמנות שנשלחו
              </h2>
              <p className="text-xs text-slate-500">
                ניתן לבטל הזמנה כדי למנוע שימוש בקישור ישן
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchInvites}
              disabled={invitesLoading}
              className="gap-2"
            >
              {invitesLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              רענון
            </Button>
          </div>

          {invitesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invites.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              אין הזמנות פעילות
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="border-b bg-muted/30 text-right">
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      אימייל
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      הוזמן על ידי
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      סטטוס
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      נוצר
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      תוקף
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => {
                    const created = inv.created_at
                      ? new Date(inv.created_at).toLocaleString("he-IL")
                      : "—";
                    const expires = inv.expires_at
                      ? new Date(inv.expires_at).toLocaleString("he-IL")
                      : "—";
                    const isRevoked =
                      inv.revoked === true || inv.status === "revoked";
                    const isAccepted = inv.status === "accepted";
                    return (
                      <tr
                        key={inv.id}
                        className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          {inv.email}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {inv.invited_by_email ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {isAccepted ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                              נוצלה
                            </span>
                          ) : isRevoked ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                              בוטלה
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                              פעילה
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {created}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {expires}
                        </td>
                        <td className="px-4 py-3">
                          {isAccepted || isRevoked ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={inviteActionLoading === inv.id}
                              onClick={() => handleRevokeInvitation(inv.id)}
                              className="gap-2"
                            >
                              {inviteActionLoading === inv.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                              ביטול הזמנה
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Audit log (append-only) */}
        <div className="rounded-xl border bg-white">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                יומן ביקורת
              </h2>
              <p className="text-xs text-slate-500">
                {auditTotal} רשומות במערכת (100 האחרונות)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAudit}
              disabled={auditLoading}
              className="gap-2"
            >
              {auditLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScrollText className="h-4 w-4" />
              )}
              רענון
            </Button>
          </div>
          {auditLoading && auditRows.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : auditRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              אין רשומות ביקורת
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" dir="rtl">
                <thead>
                  <tr className="border-b bg-muted/30 text-right">
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      זמן
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      פעולה
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      ישות
                    </th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">
                      מבצע
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b last:border-b-0 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString("he-IL")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        {row.action}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.entity_type}
                        {row.entity_id ? (
                          <span className="block truncate max-w-[140px] text-[10px] opacity-70">
                            {row.entity_id}
                          </span>
                        ) : null}
                        {row.entity_name ? (
                          <span className="block truncate max-w-[180px]">
                            {row.entity_name}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <span className="block truncate max-w-[200px]">
                          {row.actor_email_snapshot}
                        </span>
                        {row.actor_name_snapshot ? (
                          <span className="block text-[10px] opacity-70">
                            {row.actor_name_snapshot}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
