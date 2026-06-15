"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, MessageSquare, FileText, Trash2 } from "lucide-react";
import { createNotebook, listNotebooks, deleteNotebook } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { NotebookListItem } from "@/lib/types";

export default function NotebooksPage() {
  const { lang } = useLanguage();
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<NotebookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listNotebooks()
      .then(setNotebooks)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const nb = await createNotebook();
      router.push(`/notebooks/${nb.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(lang === "he" ? "למחוק את המחברת?" : "Delete this notebook?")) return;
    await deleteNotebook(id);
    setNotebooks((prev) => prev.filter((nb) => nb.id !== id));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("nb_title", lang)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("nb_subtitle", lang)}</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {t("nb_new", lang)}
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && notebooks.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center text-muted-foreground">
          <BookOpen className="h-16 w-16 opacity-20" />
          <div>
            <p className="font-medium text-foreground">{t("nb_empty_title", lang)}</p>
            <p className="mt-1 text-sm">{t("nb_empty_subtitle", lang)}</p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-2 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("nb_new", lang)}
          </button>
        </div>
      )}

      {!loading && notebooks.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((nb) => (
            <div
              key={nb.id}
              onClick={() => router.push(`/notebooks/${nb.id}`)}
              className="group relative cursor-pointer rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <button
                onClick={(e) => handleDelete(e, nb.id)}
                className="absolute right-3 top-3 hidden rounded-md p-1.5 text-muted-foreground hover:text-destructive group-hover:flex"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>

              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>

              <h3 className="mb-1 line-clamp-2 font-semibold leading-snug">{nb.title}</h3>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {nb.source_count} {t("nb_docs", lang)}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {nb.message_count} {t("nb_msgs", lang)}
                </span>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(nb.updated_at).toLocaleDateString(lang === "he" ? "he-IL" : "en-US", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
