"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserCog, Mail, Plus, X, Users, Shield, CheckCircle, XCircle, Clock } from "lucide-react";

const API = "/api/v1";

type User = { id: string; name: string; email: string; role: string };
type Member = { id: string; name: string; email: string; role: string; created_at: string };
type Invitation = { id: string; email: string; role: string; created_at: string };
type GroupMember = { user_id: string; user_name: string };
type Group = { id: string; name: string; created_by_id: string; members: GroupMember[] };
type OutgoingPerm = { id: string; target_id: string; target_name: string; access_level: string; status: string; created_at: string };
type GrantedPerm = { id: string; requester_id: string; requester_name: string; access_level: string; status: string; responded_at: string | null };

const ROLE_HE: Record<string, string> = { admin: "אדמין", lawyer: "עו״ד", intern: "מתמחה" };
const PERM_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  pending:  { bg: "#fef9c3", color: "#854d0e" },
  approved: { bg: "#dcfce7", color: "#166534" },
  granted:  { bg: "#dcfce7", color: "#166534" },
  denied:   { bg: "#fee2e2", color: "#991b1b" },
};
const PERM_STATUS_LABEL: Record<string, string> = { pending: "ממתין לאישור", approved: "מאושר", granted: "ניתן אוטומטית", denied: "נדחה" };
const PERM_LEVEL_LABEL: Record<string, string> = { full: "גישה מלאה", status: "סטטוס בלבד" };

function StatusBadge({ status }: { status: string }) {
  const s = PERM_STATUS_COLOR[status] ?? { bg: "#f3f4f6", color: "#6b7280" };
  const Icon = status === "approved" || status === "granted" ? CheckCircle : status === "denied" ? XCircle : Clock;
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: s.bg, color: s.color }}>
      <Icon className="w-3 h-3" />{PERM_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"lawyer" | "admin" | "intern">("lawyer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  // Access permissions state
  const [outgoingPerms, setOutgoingPerms] = useState<OutgoingPerm[]>([]);
  const [grantedPerms, setGrantedPerms] = useState<GrantedPerm[]>([]);
  const [permTarget, setPermTarget] = useState("");
  const [permLevel, setPermLevel] = useState<"full" | "status">("status");
  const [permSending, setPermSending] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("team_user");
    if (!saved) { router.replace("/team-login"); return; }
    setUser(JSON.parse(saved) as User);
  }, [router]);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "x-dev-email": user?.email ?? "" }),
    [user]
  );

  const fetchData = useCallback(async () => {
    if (!user) return;
    const isAdmin = user.role === "admin";
    const fetches: Promise<Response | null>[] = [
      isAdmin ? fetch(`${API}/team/members`, { headers: headers() }) : Promise.resolve(null),
      isAdmin ? fetch(`${API}/team/admin/invitations`, { headers: headers() }) : Promise.resolve(null),
      isAdmin ? fetch(`${API}/team/groups`, { headers: headers() }) : Promise.resolve(null),
      fetch(`${API}/team/access-permissions/outgoing`, { headers: headers() }),
      fetch(`${API}/team/access-permissions/granted`, { headers: headers() }),
    ];
    const [mRes, iRes, gRes, outRes, grantRes] = await Promise.all(fetches);
    if (mRes?.ok) setMembers(await mRes.json());
    if (iRes?.ok) setInvitations(await iRes.json());
    if (gRes?.ok) setGroups(await gRes.json());
    if (outRes?.ok) setOutgoingPerms(await outRes.json());
    if (grantRes?.ok) setGrantedPerms(await grantRes.json());
  }, [user, headers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function changeRole(memberId: string, newRole: string) {
    await fetch(`${API}/team/admin/members/${memberId}`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ role: newRole }),
    });
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
  }

  async function deleteMember(memberId: string, name: string) {
    if (!confirm(`למחוק את ${name} מהמערכת?`)) return;
    const res = await fetch(`${API}/team/admin/members/${memberId}`, { method: "DELETE", headers: headers() });
    if (res.ok) setMembers(prev => prev.filter(m => m.id !== memberId));
  }

  async function cancelInvitation(invId: string) {
    const res = await fetch(`${API}/team/admin/invitations/${invId}`, { method: "DELETE", headers: headers() });
    if (res.ok) setInvitations(prev => prev.filter(i => i.id !== invId));
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    try {
      const res = await fetch(`${API}/team/admin/invite`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || "שגיאה"); }
      const inv = await res.json();
      setInvitations(prev => [inv, ...prev]);
      setInviteEmail("");
      setSuccess(`ההזמנה נשלחה ל-${inv.email}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally { setLoading(false); }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      const res = await fetch(`${API}/team/groups`, {
        method: "POST", headers: headers(), body: JSON.stringify({ name: newGroupName.trim() }),
      });
      if (res.ok) { const g = await res.json(); setGroups(prev => [g, ...prev]); setNewGroupName(""); }
    } finally { setAddingGroup(false); }
  }

  async function deleteGroup(groupId: string) {
    await fetch(`${API}/team/groups/${groupId}`, { method: "DELETE", headers: headers() });
    setGroups(prev => prev.filter(g => g.id !== groupId));
  }

  async function addMemberToGroup(groupId: string, userId: string) {
    if (!userId) return;
    const m = members.find(m => m.id === userId);
    if (!m) return;
    const res = await fetch(`${API}/team/groups/${groupId}/members`, {
      method: "POST", headers: headers(), body: JSON.stringify({ user_id: userId }),
    });
    if (res.ok) {
      setGroups(prev => prev.map(g =>
        g.id === groupId ? { ...g, members: [...g.members, { user_id: userId, user_name: m.name }] } : g
      ));
    }
  }

  async function removeMemberFromGroup(groupId: string, userId: string) {
    await fetch(`${API}/team/groups/${groupId}/members/${userId}`, { method: "DELETE", headers: headers() });
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, members: g.members.filter(m => m.user_id !== userId) } : g
    ));
  }

  async function requestPermission(e: React.FormEvent) {
    e.preventDefault();
    if (!permTarget || !user) return;
    setPermSending(true);
    try {
      const res = await fetch(`${API}/team/access-permissions`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ target_id: permTarget, access_level: permLevel }),
      });
      if (res.ok) {
        const perm = await res.json();
        const targetMember = members.find(m => m.id === permTarget) ??
          (await fetch(`${API}/team/members`, { headers: headers() }).then(r => r.ok ? r.json() : [])).find((m: Member) => m.id === permTarget);
        const newPerm: OutgoingPerm = { ...perm, target_name: targetMember?.name ?? permTarget };
        setOutgoingPerms(prev => [newPerm, ...prev.filter(p => p.target_id !== permTarget)]);
        setPermTarget("");
      }
    } finally { setPermSending(false); }
  }

  async function cancelPermRequest(permId: string) {
    await fetch(`${API}/team/access-permissions/${permId}`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ status: "denied" }),
    });
    setOutgoingPerms(prev => prev.filter(p => p.id !== permId));
  }

  async function revokeGranted(permId: string) {
    if (!confirm("לבטל את ההרשאה?")) return;
    await fetch(`${API}/team/access-permissions/${permId}`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ status: "denied" }),
    });
    setGrantedPerms(prev => prev.filter(p => p.id !== permId));
  }

  if (!user) return null;
  const isAdmin = user.role === "admin";
  const availableTargets = members.filter(m => m.id !== user.id);

  return (
    <div dir="rtl" className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#33004e" }}>הגדרות</h1>
        <p className="text-sm mt-1" style={{ color: "#9a6ad7" }}>
          {isAdmin ? "ניהול משתמשים, קבוצות והרשאות" : "ניהול הרשאות גישה לנתונים שלך"}
        </p>
      </div>

      {/* ── הרשאות גישה וצפיה ── */}
      <section className="bg-white rounded-2xl border" style={{ borderColor: "#e8d8f4" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "#e8d8f4" }}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: "#33004e" }}>
            <Shield className="w-4 h-4" style={{ color: "#dcba44" }} />
            הרשאות גישה וצפיה
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#9a6ad7" }}>
            {isAdmin ? "בקש גישה לנתוני משתמש — גישה מלאה מחייבת אישור, סטטוס בלבד ניתן אוטומטית"
                     : "בקש לצפות בסטטוס של משימות — המשתמש יצטרך לאשר"}
          </p>
        </div>

        {/* Request form */}
        <div className="px-6 py-4 border-b" style={{ borderColor: "#f3eeff" }}>
          <form onSubmit={requestPermission} className="flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap">
              <select value={permTarget} onChange={e => setPermTarget(e.target.value)} required
                className="flex-1 min-w-40 rounded-lg border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: "#d8c0ec", color: permTarget ? "#33004e" : "#9a6ad7" }}>
                <option value="">בחר משתמש...</option>
                {availableTargets.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({ROLE_HE[m.role]})</option>
                ))}
              </select>
              {isAdmin && (
                <select value={permLevel} onChange={e => setPermLevel(e.target.value as "full" | "status")}
                  className="rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: "#d8c0ec", color: "#33004e" }}>
                  <option value="status">סטטוס בלבד</option>
                  <option value="full">גישה מלאה</option>
                </select>
              )}
              <button type="submit" disabled={permSending || !permTarget}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#33004e" }}>
                <Plus className="w-4 h-4" />בקש גישה
              </button>
            </div>
          </form>
        </div>

        {/* Outgoing requests */}
        {outgoingPerms.length > 0 && (
          <div className="px-6 py-4 border-b" style={{ borderColor: "#f3eeff" }}>
            <p className="text-xs font-medium mb-3" style={{ color: "#9a6ad7" }}>בקשות ששלחתי</p>
            <div className="space-y-2">
              {outgoingPerms.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ background: "#f8f5fc" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium" style={{ color: "#33004e" }}>{p.target_name}</span>
                    <span className="text-xs text-slate-400">{PERM_LEVEL_LABEL[p.access_level]}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  {p.status === "pending" && (
                    <button onClick={() => cancelPermRequest(p.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Granted permissions (what others approved for me → I can revoke) */}
        <div className="px-6 py-4">
          <p className="text-xs font-medium mb-3" style={{ color: "#9a6ad7" }}>הרשאות שהענקתי לאחרים</p>
          {grantedPerms.length === 0 ? (
            <p className="text-sm text-slate-400">לא הענקת גישה לאף אחד</p>
          ) : (
            <div className="space-y-2">
              {grantedPerms.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ background: "#f8f5fc" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium" style={{ color: "#33004e" }}>{p.requester_name}</span>
                    <span className="text-xs text-slate-400">{PERM_LEVEL_LABEL[p.access_level]}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <button onClick={() => revokeGranted(p.id)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-red-50 hover:border-red-300 hover:text-red-600 shrink-0"
                    style={{ borderColor: "#e8d8f4", color: "#9a6ad7" }}>
                    <XCircle className="w-3.5 h-3.5" />בטל
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Admin-only sections ── */}
      {isAdmin && <>

        {/* Invite form */}
        <section className="bg-white rounded-2xl border p-6 space-y-4" style={{ borderColor: "#e8d8f4" }}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: "#33004e" }}>
            <Mail className="w-4 h-4" style={{ color: "#dcba44" }} />
            הזמן משתמש חדש
          </h2>
          <form onSubmit={sendInvite} className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email" required value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="כתובת מייל"
                className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: "#d8c0ec" }}
              />
              <div className="flex gap-3">
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as "lawyer" | "admin" | "intern")}
                  className="flex-1 sm:flex-none rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: "#d8c0ec", color: "#33004e" }}>
                  <option value="lawyer">עו״ד</option>
                  <option value="intern">מתמחה</option>
                  <option value="admin">אדמין</option>
                </select>
                <button type="submit" disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "#33004e" }}>
                  <Plus className="w-4 h-4" />הזמן
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && <p className="text-sm" style={{ color: "#33004e" }}>{success}</p>}
          </form>
          {invitations.length > 0 && (
            <div className="mt-2 space-y-2">
              <p className="text-xs font-medium" style={{ color: "#9a6ad7" }}>הזמנות ממתינות</p>
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "#f8f5fc" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: "#33004e" }}>{inv.email}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#ede0f8", color: "#5c2d82" }}>{ROLE_HE[inv.role]}</span>
                  </div>
                  <button onClick={() => cancelInvitation(inv.id)} className="text-gray-400 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Members list */}
        <section className="bg-white rounded-2xl border" style={{ borderColor: "#e8d8f4" }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: "#e8d8f4" }}>
            <h2 className="font-semibold flex items-center gap-2" style={{ color: "#33004e" }}>
              <UserCog className="w-4 h-4" style={{ color: "#dcba44" }} />
              משתמשים רשומים ({members.length})
            </h2>
          </div>
          <div className="divide-y" style={{ borderColor: "#f3eeff" }}>
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between px-6 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "#33004e" }}>{m.name}</p>
                  <p className="text-xs" style={{ color: "#9a6ad7" }}>{m.email}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                    disabled={m.id === user.id}
                    className="rounded-lg border px-2 py-1 text-xs focus:outline-none disabled:opacity-50"
                    style={{ borderColor: "#d8c0ec", color: "#33004e" }}>
                    <option value="lawyer">עו״ד</option>
                    <option value="intern">מתמחה</option>
                    <option value="admin">אדמין</option>
                  </select>
                  <button onClick={() => deleteMember(m.id, m.name)} disabled={m.id === user.id}
                    className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Groups */}
        <section className="bg-white rounded-2xl border" style={{ borderColor: "#e8d8f4" }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: "#e8d8f4" }}>
            <h2 className="font-semibold flex items-center gap-2" style={{ color: "#33004e" }}>
              <Users className="w-4 h-4" style={{ color: "#dcba44" }} />
              קבוצות ({groups.length})
            </h2>
          </div>
          <div className="px-6 py-4 border-b" style={{ borderColor: "#f3eeff" }}>
            <form onSubmit={createGroup} className="flex gap-2">
              <input
                value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                placeholder="שם קבוצה חדשה..."
                className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                style={{ borderColor: "#d8c0ec" }}
              />
              <button type="submit" disabled={addingGroup || !newGroupName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#7c3aed" }}>
                <Plus className="w-4 h-4" />צור
              </button>
            </form>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">אין קבוצות עדיין</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "#f3eeff" }}>
              {groups.map(g => {
                const nonMembers = members.filter(m => !g.members.some(gm => gm.user_id === m.id));
                return (
                  <div key={g.id} className="px-6 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-sm" style={{ color: "#33004e" }}>{g.name}</span>
                      <button onClick={() => deleteGroup(g.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 mb-3">
                      {g.members.map(m => (
                        <div key={m.user_id} className="flex items-center justify-between rounded-lg px-3 py-2"
                          style={{ background: "#f8f5fc" }}>
                          <span className="text-sm font-medium" style={{ color: "#33004e" }}>{m.user_name}</span>
                          <button onClick={() => removeMemberFromGroup(g.id, m.user_id)}
                            className="text-gray-300 hover:text-red-500 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {g.members.length === 0 && <span className="text-xs text-slate-400">אין חברים עדיין</span>}
                    </div>
                    {nonMembers.length > 0 && (
                      <select defaultValue=""
                        onChange={e => { if (e.target.value) { addMemberToGroup(g.id, e.target.value); e.target.value = ""; } }}
                        className="rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none"
                        style={{ borderColor: "#d8c0ec", color: "#9a6ad7" }}>
                        <option value="">+ הוסף חבר לקבוצה</option>
                        {nonMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </>}
    </div>
  );
}
