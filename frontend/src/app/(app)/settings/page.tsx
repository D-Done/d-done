"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PastelAvatar } from "@/components/pastel-avatar";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMe, updateProfile, setOrgLanguage, type MeResponse } from "@/lib/api";
import { GroupsSettings } from "@/components/groups-settings";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import { Pencil, Check, X, Loader2 } from "lucide-react";

export default function SettingsPage() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const { lang, setLang } = useLanguage();
  const [langSaving, setLangSaving] = useState(false);
  const [langSaved, setLangSaved] = useState(false);
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
    if (newLang === lang) return;
    setLangSaving(true);
    try {
      await setOrgLanguage(newLang);
      setLang(newLang);
      toast.success(newLang === "en" ? "Language set to English" : "השפה הוגדרה לעברית");
      setLangSaved(true);
      setTimeout(() => setLangSaved(false), 2500);
    } catch (err) {
      toast.error(`שגיאה בשמירת השפה: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLangSaving(false);
    }
  }

  return (
    <>
      <h1 className="text-3xl font-bold">{t("settings_title", lang)}</h1>
      <p className="mt-1 text-muted-foreground">{t("settings_subtitle", lang)}</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("account_details", lang)}</CardTitle>
          <CardDescription>{t("account_synced", lang)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
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
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" onClick={saveNameEdit} disabled={nameSaving}>
                      {nameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-zinc-600" onClick={cancelEditName} disabled={nameSaving}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <p className="text-lg font-medium">{user.name ?? user.email}</p>
                    <button
                      onClick={startEditName}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      title={lang === "en" ? "Edit name" : "ערוך שם"}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
          )}

          <Separator />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("groups_title", lang)}</CardTitle>
          <CardDescription>{t("groups_desc", lang)}</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupsSettings />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>שפה / Language</CardTitle>
          <CardDescription>
            {t("language_card_desc", lang)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button
              variant={lang === "he" ? "default" : "outline"}
              className="rounded-2xl min-w-[100px]"
              disabled={langSaving}
              onClick={() => handleLanguageChange("he")}
            >
              עברית
            </Button>
            <Button
              variant={lang === "en" ? "default" : "outline"}
              className="rounded-2xl min-w-[100px]"
              disabled={langSaving}
              onClick={() => handleLanguageChange("en")}
            >
              English
            </Button>
            {langSaved && (
              <span className="text-sm text-green-600">{t("saved", lang)}</span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("language_change_note", lang)}
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("ai_card_title", lang)}</CardTitle>
          <CardDescription>{t("ai_card_desc", lang)}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {t("ai_card_body", lang)}
          </div>
          <Button asChild className="rounded-2xl">
            <Link href="/settings/ai-prompts">{t("manage_prompts", lang)}</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
