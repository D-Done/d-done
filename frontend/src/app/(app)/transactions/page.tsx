"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  FileText,
  Folder,
  MapPin,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import * as api from "@/lib/api";
import type { ProjectListItem } from "@/lib/types";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import AvatarGroup from "@/components/ui/avatar-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { VdrExternalUploadDialog } from "@/components/vdr-external-upload-dialog";

function statusLabel(status: string, lang: import("@/lib/i18n").Lang): string {
  const key = `status_${status}` as string;
  return t(key, lang) !== key ? t(key, lang) : status;
}

function statusPillClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-slate-900 text-white hover:bg-slate-900";
    case "processing":
      return "bg-amber-500 text-white hover:bg-amber-500";
    case "failed":
      return "bg-red-600 text-white hover:bg-red-600";
    case "needs_review":
      return "bg-orange-500 text-white hover:bg-orange-500";
    case "partial":
      return "bg-sky-500 text-white hover:bg-sky-500";
    default:
      return "bg-sky-600 text-white hover:bg-sky-600";
  }
}

function projectTypeLabel(transactionType: string): { group: string; label: string } {
  if (transactionType === "real_estate_finance" || transactionType === "real_estate")
    return { group: "real_estate", label: 'נדל"ן' };
  if (transactionType === "ma") return { group: "ma", label: "M&A" };
  if (transactionType === "company_investment")
    return { group: "company_investment", label: "השקעה בחברה" };
  return { group: "unassigned", label: "לא משויך" };
}

function TransactionsList() {
  const { lang, dir } = useLanguage();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmProject, setConfirmProject] = useState<ProjectListItem | null>(
    null,
  );

  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listProjects(q ? { q } : undefined);
      setProjects(data);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const onFocus = () => fetchProjects();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchProjects]);

  const handleDeleteConfirm = async () => {
    if (!confirmProject) return;
    const id = confirmProject.id;
    setConfirmProject(null);
    setDeletingId(id);
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // re-fetch to restore correct state if delete failed
      fetchProjects();
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-12 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="mt-10 rounded-2xl bg-white dark:bg-zinc-900/80 text-center shadow-sm">
        <CardContent className="py-16">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-zinc-800/70 text-slate-600 dark:text-slate-300">
            <Building2 className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t("no_projects", lang)}
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t("create_to_start", lang)}
          </p>
          <Button className="mt-6 rounded-2xl" asChild>
            <Link href="/transactions/new">
              <Plus className="ml-2 h-4 w-4" />
              {t("new_project", lang)}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mt-6 space-y-8">
        {[
          { key: "real_estate", title: t("group_real_estate", lang) },
          { key: "ma", title: t("group_ma", lang) },
          { key: "company_investment", title: t("group_investment", lang) },
          { key: "other", title: t("group_other", lang) },
          { key: "unassigned", title: t("group_unassigned", lang) },
        ].map((group) => {
          const items = projects.filter(
            (p) => projectTypeLabel(p.transaction_type).group === group.key,
          );
          if (items.length === 0) return null;

          return (
            <div key={group.key}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-600/50 bg-white dark:bg-zinc-800/70 text-slate-700 dark:text-slate-300">
                    <Folder className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {group.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {items.length} {t("nav_projects", lang).toLowerCase()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => {
                  const isDeleting = deletingId === p.id;
                  return (
                    <div key={p.id} className="group relative">
                      <Link href={`/transactions/${p.id}`}>
                        <Card
                          className={[
                            "h-full cursor-pointer rounded-2xl bg-white dark:bg-zinc-900/80 shadow-sm transition hover:shadow-md",
                            isDeleting ? "pointer-events-none opacity-50" : "",
                          ].join(" ")}
                        >
                          <CardContent className="flex h-full flex-col p-6">
                            <div className="flex items-start justify-between gap-3">
                              <Badge
                                className={[
                                  "rounded-full px-3 py-1 text-xs font-semibold shadow-none border-none",
                                  statusPillClass(p.status),
                                ].join(" ")}
                              >
                                {statusLabel(p.status, lang)}
                              </Badge>
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-600/50 bg-slate-50 dark:bg-zinc-800/70 text-slate-600 dark:text-slate-300">
                                <FileText className="h-4 w-4" />
                              </div>
                            </div>
                            <div className="mt-8 text-center">
                              <div className="line-clamp-2 text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
                                {p.title}
                              </div>
                              {(p.block || p.parcel) && (
                                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                                  <span className="font-mono">
                                    {[p.block && `${t("block_prefix", lang)} ${p.block}`, p.parcel && `${t("parcel_prefix", lang)} ${p.parcel}`]
                                      .filter(Boolean)
                                      .join(" • ")}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="mt-6 flex-1" />
                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                              <div className="flex items-center gap-1.5">
                                <span>{p.file_count} {lang === "en" ? "docs" : "מסמכים"}</span>
                                <span className="text-slate-300 dark:text-slate-500">•</span>
                                <CalendarDays className="h-3.5 w-3.5" />
                                <span>{new Date(p.created_at).toLocaleDateString("he-IL")}</span>
                              </div>
                              {p.members && p.members.length > 0 && (
                                <AvatarGroup
                                  items={p.members.map((m, i) => ({
                                    id: m.email,
                                    name: m.name ?? m.email,
                                    image: null,
                                  }))}
                                  maxVisible={5}
                                  size="sm"
                                  className="justify-end"
                                />
                              )}
                            </div>
                            <div className="mt-4 border-t pt-4">
                              <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                                <span className="font-medium">
                                  {t("view_project", lang)}
                                </span>
                                <ChevronLeft className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-hover:-translate-x-0.5" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>

                      {/* Delete button — outside the Link so it doesn't navigate */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setConfirmProject(p);
                        }}
                        disabled={isDeleting}
                        className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 opacity-0 transition-opacity hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed"
                        aria-label={t("delete_project", lang)}
                      >
                        {isDeleting ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation dialog */}
      <AlertDialog
        open={!!confirmProject}
        onOpenChange={(open) => !open && setConfirmProject(null)}
      >
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_confirm_title", lang)}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "en" ? "Delete project " : "האם למחוק את הפרויקט "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                &quot;{confirmProject?.title}&quot;
              </span>
              {lang === "en" ? "? " : "? "}{t("delete_confirm_body", lang)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {t("delete_btn", lang)}
            </AlertDialogAction>
            <AlertDialogCancel>{t("cancel", lang)}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function TransactionsPage() {
  const [vdrDialogOpen, setVdrDialogOpen] = useState(false);
  const { lang } = useLanguage();

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("projects_title", lang)}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("manage_dd", lang)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => setVdrDialogOpen(true)}
          >
            <Upload className="ml-2 h-4 w-4" />
            {t("vdr_upload", lang)}
          </Button>
          <Button asChild className="rounded-2xl">
            <Link href="/transactions/new">
              <Plus className="ml-2 h-4 w-4" />
              {t("new_project", lang)}
            </Link>
          </Button>
        </div>
      </div>
      <VdrExternalUploadDialog open={vdrDialogOpen} onOpenChange={setVdrDialogOpen} />

      <Suspense
        fallback={
          <div className="mt-12 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <TransactionsList />
      </Suspense>
    </>
  );
}
