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

const NAV_ITEMS = [
  { id: "account", labelHe: "פרטי חשבון", labelEn: "Account", icon: Settings },
  { id: "groups",  labelHe: "קבוצות",       labelEn: "Groups",  icon: Users  },
  { id: "language",labelHe: "שפה",           labelEn: "Language",icon: Globe  },
  { id: "ai",      labelHe: "AI",            labelEn: "AI",      icon: Bot   },
];

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-8 py-4 border-b border-zinc-100 dark:border-zinc-800/50 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 leading-snug">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const { lang, setLang } = useLanguage();
  const [langSaving, setLangSaving] = useState(false);
  const [activeNav, setActiveNav] = useState("account");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getMe().then(setUser); }, []);

  function startEditName() {
    setNameInput(user?.name ?? "");
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }
  function cancelEditName() { setEditingName(false); setNameInput(""); }
  async function saveNameEdit() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === user?.name) { cancelEditName(); return; }
    setNameSaving(true);
    try {
      const updated = await updateProfile({ name: trimmed });
      setUser(updated);
      setEditingName(false);
      toast.success(lang === "en" ? "Name updated" : "השם עודכן");
    } catch {
      toast.error(lang === "en" ? "Failed to update name" : "שגיאה בעדכון השם");
    } finally { setNameSaving(false); }
  }

  async function handleLanguageChange(newLang: "he" | "en") {
    if (newLang === lang || langSaving) return;
    setLangSaving(true);
    try {
      await setOrgLanguage(newLang);
      setLang(newLang);
      toast.success(newLang === "en" ? "Language set to English" : "השפה הוגדרה לעברית");
    } catch (err) {
      toast.error(`שגיאה: ${err instanceof Error ? err.message : err}`);
    } finally { setLangSaving(false); }
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveNav(id);
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {t("settings_title", lang)}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("settings_subtitle", lang)}
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-8 items-start">

        {/* ── Sticky sidebar nav ───────────────────────────── */}
        <nav className="w-48 shrink-0 sticky top-6 flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ id, labelHe, labelEn, icon: Icon }) => {
            const label = lang === "en" ? labelEn : labelHe;
            const active = activeNav === id;
            return (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={[
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-start transition-colors w-full",
                  active
                    ? "bg-zinc-100 dark:bg-zinc-800/70 font-semibold text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 hover:text-zinc-700 dark:hover:text-zinc-300",
                ].join(" ")}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-500"}`} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* ── Main content ─────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">

          {/* Account */}
          <section id="account" className="rounded-2xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/50">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{t("account_details", lang)}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{t("account_synced", lang)}</p>
            </div>
            <div className="px-6 py-5">
              {user ? (
                <>
                  {/* Avatar row */}
                  <div className="flex items-center gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800/50">
                    <PastelAvatar name={user.name} email={user.email} size="lg" />
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{user.name ?? user.email}</p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
                    </div>
                  </div>
                  {/* Name edit row */}
                  <Row label={lang === "en" ? "Display name" : "שם תצוגה"}>
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
                          className="h-8 w-48 text-sm"
                          disabled={nameSaving}
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" onClick={saveNameEdit} disabled={nameSaving}>
                          {nameSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400" onClick={cancelEditName} disabled={nameSaving}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">{user.name ?? "—"}</span>
                        <button onClick={startEditName} className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </Row>
                  <Row label={lang === "en" ? "Email" : "אימייל"}>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</span>
                  </Row>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
                  <div className="h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
                </div>
              )}
            </div>
          </section>

          {/* Groups */}
          <section id="groups" className="rounded-2xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/50">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{t("groups_title", lang)}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{t("groups_desc", lang)}</p>
            </div>
            <div className="px-6 py-5">
              <GroupsSettings />
            </div>
          </section>

          {/* Language */}
          <section id="language" className="rounded-2xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/50">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">שפה / Language</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{t("language_card_desc", lang)}</p>
            </div>
            <div className="px-6 py-5">
              <Row label={lang === "en" ? "Interface language" : "שפת הממשק"} description={t("language_change_note", lang)}>
                <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/40 p-1 gap-1">
                  {(["he", "en"] as const).map((l) => (
                    <button
                      key={l}
                      disabled={langSaving}
                      onClick={() => handleLanguageChange(l)}
                      className={[
                        "rounded-lg px-5 py-1.5 text-sm font-medium transition-all duration-150",
                        lang === l
                          ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-inset ring-zinc-200/80 dark:ring-zinc-700/50"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
                      ].join(" ")}
                    >
                      {l === "he" ? "עברית" : "English"}
                      {langSaving && lang !== l && <Loader2 className="inline mr-1.5 h-3 w-3 animate-spin" />}
                    </button>
                  ))}
                </div>
              </Row>
            </div>
          </section>

          {/* AI */}
          <section id="ai" className="rounded-2xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/50">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{t("ai_card_title", lang)}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{t("ai_card_desc", lang)}</p>
            </div>
            <div className="px-6 py-5">
              <Row label={lang === "en" ? "Custom prompts" : "פרומפטים מותאמים"} description={t("ai_card_body", lang)}>
                <Button asChild variant="outline" className="rounded-xl gap-1.5 text-sm">
                  <Link href="/settings/ai-prompts">
                    {t("manage_prompts", lang)}
                    <ChevronLeft className="h-3.5 w-3.5 opacity-50" />
                  </Link>
                </Button>
              </Row>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
