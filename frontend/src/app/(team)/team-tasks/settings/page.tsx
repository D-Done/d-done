"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserCog, Mail, Plus, X, Users } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

type User = { id: string; name: string; email: string; role: string };
type Member = { id: string; name: string; email: string; role: string; created_at: string };
type Invitation = { id: string; email: string; role: string; created_at: string };
type GroupMember = { user_id: string; user_name: string };
type Group = { id: string; name: string; members: GroupMember[] };

const ROLE_HE: Record<string, string> = { admin: "אדמין", lawyer: "עו״ד" };

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"lawyer" | "admin">("lawyer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("team_user");
    if (!saved) { router.replace("/"); return; }
    const u = JSON.parse(saved) as User;
    if (u.role !== "admin") { router.replace("/tasks"); return; }
    setUser(u);
  }, [router]);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "x-dev-email": user?.email ?? "" }),
    [user]
  );

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [mRes, iRes, gRes] = await Promise.all([
      fetch(`${API}/team/members`, { headers: headers() }),
      fetch(`${API}/team/admin/invitations`, { headers: headers() }),
      fetch(`${API}/team/groups`, { headers: headers() }),
    ]);
    if (mRes.ok) setMembers(await mRes.json());
    if (iRes.ok) setInvitations(await iRes.json());
    if (gRes.ok) setGroups(await gRes.json());
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
    const res = await fetch(`${API}/team/groups/${groupId}/members`, {
      method: "POST", headers: headers(), body: JSON.stringify({ user_id: userId }),
    });
    if (res.ok) {
      const m = await res.json();
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, members: [...g.members, { user_id: m.user_id, user_name: m.user_name }] } : g));
    }
  }

  async function removeMemberFromGroup(groupId: string, userId: string) {
    await fetch(`${API}/team/groups/${groupId}/members/${userId}`, { method: "DELETE", headers: headers() });
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, members: g.members.filter(m => m.user_id !== userId) } : g));
  }

  if (!user) return null;

  return (
    <div dir="rtl" className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#33004e" }}>הגדרות</h1>
        <p className="text-sm mt-1" style={{ color: "#9a6ad7" }}>ניהול משתמשים, קבוצות והזמנות</p>
      </div>

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
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as "lawyer" | "admin")}
                className="flex-1 sm:flex-none rounded-lg border px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: "#d8c0ec", color: "#33004e" }}>
                <option value="lawyer">עו״ד</option>
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

        {/* Create group */}
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
                    <button onClick={() => deleteGroup(g.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {g.members.map(m => (
                      <span key={m.user_id} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                        style={{ background: "#f3eeff", color: "#7c3aed" }}>
                        {m.user_name}
                        <button onClick={() => removeMemberFromGroup(g.id, m.user_id)}
                          className="hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {g.members.length === 0 && (
                      <span className="text-xs text-slate-400">אין חברים עדיין</span>
                    )}
                  </div>
                  {nonMembers.length > 0 && (
                    <select
                      defaultValue=""
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
    </div>
  );
}
