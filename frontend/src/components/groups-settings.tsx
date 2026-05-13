"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import type { Group } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserSearchInput } from "@/components/user-search-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function GroupsSettings() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create group
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  // Add member
  const [addingMemberGroupId, setAddingMemberGroupId] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);

  // Delete group confirm
  const [deleteGroup, setDeleteGroup] = useState<Group | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await api.listGroups());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      const g = await api.createGroup(newGroupName.trim());
      setGroups((prev) => [...prev, g]);
      setNewGroupName("");
      setExpandedId(g.id);
    } catch (err) {
      toast.error("שגיאה ביצירת קבוצה", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameGroup(groupId: string) {
    if (!renameValue.trim()) return;
    setRenameSaving(true);
    try {
      const updated = await api.renameGroup(groupId, renameValue.trim());
      setGroups((prev) => prev.map((g) => (g.id === groupId ? updated : g)));
      setRenamingId(null);
    } catch (err) {
      toast.error("שגיאה בשינוי שם", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setRenameSaving(false);
    }
  }

  async function handleDeleteGroup(group: Group) {
    try {
      await api.deleteGroup(group.id);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      if (expandedId === group.id) setExpandedId(null);
    } catch (err) {
      toast.error("שגיאה במחיקת קבוצה", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDeleteGroup(null);
    }
  }

  async function handleAddMember(groupId: string, email: string) {
    setAddingMember(true);
    try {
      const member = await api.addGroupMember(groupId, email);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, members: [...g.members, member], member_count: g.member_count + 1 }
            : g,
        ),
      );
      setAddingMemberGroupId(null);
    } catch (err) {
      toast.error("שגיאה בהוספת חבר", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(groupId: string, userId: string, email: string) {
    try {
      await api.removeGroupMember(groupId, userId);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, members: g.members.filter((m) => m.user_id !== userId), member_count: g.member_count - 1 }
            : g,
        ),
      );
    } catch (err) {
      toast.error(`שגיאה בהסרת ${email}`, { description: err instanceof Error ? err.message : undefined });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create group */}
      <div className="flex gap-2">
        <Input
          placeholder="שם קבוצה חדשה..."
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
          className="max-w-xs"
        />
        <Button onClick={handleCreateGroup} disabled={!newGroupName.trim() || creating} size="sm">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="mr-1">צור קבוצה</span>
        </Button>
      </div>

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-12 text-center text-sm text-slate-400">
          <Users className="mx-auto h-8 w-8 mb-3 opacity-40" />
          אין קבוצות עדיין. צור קבוצה ראשונה.
        </div>
      )}

      <div className="space-y-3">
        {groups.map((group) => {
          const expanded = expandedId === group.id;
          const isRenaming = renamingId === group.id;
          const isAddingMember = addingMemberGroupId === group.id;

          return (
            <div
              key={group.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden"
            >
              {/* Group header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setExpandedId(expanded ? null : group.id)}
                  className="flex items-center gap-2 flex-1 text-right min-w-0"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  )}
                  <Users className="h-4 w-4 text-indigo-500 shrink-0" />
                  {isRenaming ? (
                    <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameGroup(group.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="h-7 text-sm max-w-[200px]"
                      />
                      <button
                        onClick={() => handleRenameGroup(group.id)}
                        disabled={renameSaving}
                        className="text-green-600 hover:text-green-700 disabled:opacity-50"
                      >
                        {renameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : (
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{group.name}</span>
                  )}
                  <span className="text-xs text-slate-400 shrink-0">{group.member_count} חברים</span>
                </button>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setRenamingId(group.id);
                      setRenameValue(group.name);
                      setExpandedId(group.id);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="שנה שם"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteGroup(group)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                    title="מחק קבוצה"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded members */}
              {expanded && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 pb-3 pt-2 space-y-2">
                  {group.members.length === 0 && (
                    <p className="text-xs text-slate-400 py-1">אין חברים עדיין</p>
                  )}
                  {group.members.map((m) => (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        {m.name && (
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</p>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.email}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(group.id, m.user_id, m.email)}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition shrink-0"
                        title="הסר מהקבוצה"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Add member input */}
                  {isAddingMember ? (
                    <div className="flex gap-2 mt-1 items-center">
                      <div className="flex-1">
                        <UserSearchInput
                          autoFocus
                          disabled={addingMember}
                          placeholder="חפש לפי שם או מייל..."
                          onSelect={(u) => handleAddMember(group.id, u.email)}
                        />
                      </div>
                      {addingMember && <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 shrink-0"
                        onClick={() => setAddingMemberGroupId(null)}
                      >
                        ביטול
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingMemberGroupId(group.id)}
                      className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 mt-1 transition"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      הוסף חבר לקבוצה
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteGroup} onOpenChange={(open) => !open && setDeleteGroup(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת קבוצה</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את הקבוצה <strong>{deleteGroup?.name}</strong>?
              הקבוצה תימחק אך חברי הצוות שנוספו לפרויקטים יישארו שם.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteGroup && handleDeleteGroup(deleteGroup)}
            >
              מחק
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
