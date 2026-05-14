"use client";

import { useEffect, useState } from "react";
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
import { getMe, setOrgLanguage, type MeResponse } from "@/lib/api";
import { GroupsSettings } from "@/components/groups-settings";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { toast } from "sonner";

export default function SettingsPage() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const { lang, setLang } = useLanguage();
  const [langSaving, setLangSaving] = useState(false);
  const [langSaved, setLangSaved] = useState(false);

  useEffect(() => {
    getMe().then(setUser);
  }, []);

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
              <div>
                <p className="text-lg font-medium">{user.name ?? user.email}</p>
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
