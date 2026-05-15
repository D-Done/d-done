"use client";

import { useEffect, useRef, useState } from "react";
import { PastelAvatar } from "@/components/pastel-avatar";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMe, updateProfile, setOrgLanguage, type MeResponse } from "@/lib/api";
import { GroupsSettings } from "@/components/groups-settings";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Bot,
  Check,
  ChevronLeft,
  Globe,
  Loader2,
  Pencil,
  Settings,
  Users,
  X,
} from "lucide-react";

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
      <div className="flex items-start gap-4 px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-[15px]">{title}</p>
          {description && (
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const { lang, setLang } = useLanguage();
  const [langSaving, setLangSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMe().then(setUser);
  }, []);

  function startEditName() {
    setNameInput(user?.name ?? "");
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }

  function cancelEditName() {
    setEditingName(false);
    setNameInput("");
  }

  async function saveNameEdit() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === user?.name) { cancelEditName(); return; }
    setNameSaving(true);
    try {
      const updated = await updateProfile({ name: trimmed });
      setUser(updated);
      setEditingName(false);
      toast.success(lang === "en" ? "Name updated" : "השם עודכן בהצלחה");
    } catch {
      toast.error(lang === "en" ? "Failed to update name" : "שגיאה בעדכון השם");
    } finally {
      setNameSaving(false);
    }
  }

  async function handleLanguageChange(newLang: "he" | "en") {
    if (newLang === lang || langSaving) return;
    setLangSaving(true);
    try {
      await setOrgLanguage(newLang);
      setLang(newLang);
      toast.success(newLang === "en" ? "Language set to English" : "השפה הוגדרה לעברית");
    } catch (err) {
      toast.error(`שגיאה בשמירת השפה: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLangSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
            {t("settings_title", lang)}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("settings_subtitle", lang)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Account */}
        <SectionCard
          icon={<Settings className="h-4 w-4" />}
          title={t("account_details", lang)}
          description={t("account_synced", lang)}
        >
          {user ? (
            <div className="flex items-center gap-4">
              <PastelAvatar name={user.name} email={user.email} size="lg" />
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={nameInputRef}
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveNameEdit();
                        if (e.key === "Escape") cancelEditName();
                      }}
                      className="h-9 max-w-xs text-base font-medium"
                      disabled={nameSaving}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      onClick={saveNameEdit}
                      disabled={nameSaving}
                    >
                      {nameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-zinc-400 hover:text-zinc-600"
                      onClick={cancelEditName}
                      disabled={nameSaving}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {user.name ?? user.email}
                    </p>
                    <button
                      onClick={startEditName}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      title={lang === "en" ? "Edit name" : "ערוך שם"}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{user.email}</p>
              </div>
            </div>
          ) : (
            <div className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/50" />
          )}
        </SectionCard>

        {/* Groups */}
        <SectionCard
          icon={<Users className="h-4 w-4" />}
          title={t("groups_title", lang)}
          description={t("groups_desc", lang)}
        >
          <GroupsSettings />
        </SectionCard>

        {/* Language */}
        <SectionCard
          icon={<Globe className="h-4 w-4" />}
          title="שפה / Language"
          description={t("language_card_desc", lang)}
        >
          <div className="flex flex-col gap-3">
            <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/40 p-1 gap-1">
              {(["he", "en"] as const).map((l) => (
                <button
                  key={l}
                  disabled={langSaving}
                  onClick={() => handleLanguageChange(l)}
                  className={[
                    "flex-1 rounded-lg px-6 py-2 text-sm font-medium transition-all duration-150",
                    lang === l
                      ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-inset ring-zinc-200/80 dark:ring-zinc-700/50"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
                  ].join(" ")}
                >
                  {l === "he" ? "עברית" : "English"}
                  {langSaving && lang !== l && <Loader2 className="inline ml-1.5 h-3 w-3 animate-spin" />}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {t("language_change_note", lang)}
            </p>
          </div>
        </SectionCard>

        {/* AI Prompts */}
        <SectionCard
          icon={<Bot className="h-4 w-4" />}
          title={t("ai_card_title", lang)}
          description={t("ai_card_desc", lang)}
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t("ai_card_body", lang)}
            </p>
            <Button asChild variant="outline" className="rounded-xl shrink-0 gap-1.5">
              <Link href="/settings/ai-prompts">
                {t("manage_prompts", lang)}
                <ChevronLeft className="h-3.5 w-3.5 opacity-50" />
              </Link>
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
