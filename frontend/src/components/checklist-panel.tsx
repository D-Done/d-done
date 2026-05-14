"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  FileDown,
  FileText,
  Landmark,
  Loader2,
  MapPin,
  PenLine,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import type { ChecklistItem } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORIES: Record<string, { label: string; labelEn: string; icon: React.ReactNode; color: string }> = {
  signing: {
    label: "חתימות חסרות",
    labelEn: "Missing Signatures",
    icon: <PenLine className="h-4 w-4" />,
    color: "text-red-600 bg-red-50 border-red-200",
  },
  warning_note: {
    label: "הערות אזהרה",
    labelEn: "Caveats / Warning Notes",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-orange-600 bg-orange-50 border-orange-200",
  },
  mortgage: {
    label: "משכנתאות",
    labelEn: "Mortgages",
    icon: <Landmark className="h-4 w-4" />,
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
  missing_doc: {
    label: "מסמכים חסרים",
    labelEn: "Missing Documents",
    icon: <FileText className="h-4 w-4" />,
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  lender: {
    label: "גוף המממן",
    labelEn: "Financing Body",
    icon: <Building2 className="h-4 w-4" />,
    color: "text-yellow-700 bg-yellow-50 border-yellow-200",
  },
  corporate: {
    label: "תאגידי",
    labelEn: "Corporate",
    icon: <MapPin className="h-4 w-4" />,
    color: "text-slate-600 bg-slate-50 border-slate-200",
  },
  other: {
    label: "אחר",
    labelEn: "Other",
    icon: <CheckSquare className="h-4 w-4" />,
    color: "text-slate-500 bg-slate-50 border-slate-200",
  },
};

const CATEGORY_ORDER = [
  "signing",
  "warning_note",
  "mortgage",
  "missing_doc",
  "lender",
  "corporate",
  "other",
];

// ── Share dialog ──────────────────────────────────────────────────────────────

function ShareDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; emailSent: boolean } | null>(null);

  const handleShare = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await api.shareChecklist(projectId, {
        invited_email: email.trim(),
        message: message.trim() || undefined,
      });
      setResult({ url: res.share_url, emailSent: res.email_sent });
      toast.success(res.email_sent ? "הזמנה נשלחה בהצלחה" : "הקישור נוצר (שליחת מייל נכשלה)");
    } catch (err) {
      toast.error("שגיאה ביצירת הקישור");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 space-y-4" dir="rtl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">שיתוף רשימת השלמות</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {result.emailSent
                ? `הזמנה נשלחה ל-${email}. הקישור תקף ל-30 ימים.`
                : "המייל לא נשלח — העתק את הקישור ושלח ידנית."}
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={result.url}
                className="flex-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(result.url);
                  toast.success("הועתק");
                }}
              >
                העתק
              </Button>
            </div>
            <Button className="w-full" onClick={onClose}>
              סגור
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">כתובת מייל של הצד השני</label>
                <Input
                  dir="ltr"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  הודעה אישית <span className="text-slate-400">(אופציונלי)</span>
                </label>
                <Textarea
                  placeholder="הוסף הודעה שתופיע במייל..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 h-24 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 gap-2"
                onClick={handleShare}
                disabled={!email.trim() || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                שלח הזמנה
              </Button>
              <Button variant="outline" onClick={onClose}>
                ביטול
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Add item form ─────────────────────────────────────────────────────────────

function AddItemForm({
  projectId,
  onAdded,
  onCancel,
}: {
  projectId: string;
  onAdded: (item: ChecklistItem) => void;
  onCancel: () => void;
}) {
  const { lang: formLang } = useLanguage();
  const [category, setCategory] = useState("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const item = await api.addChecklistItem(projectId, {
        category,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      onAdded(item);
      toast.success("פריט נוסף");
    } catch {
      toast.error("שגיאה בהוספת פריט");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 space-y-3" dir="rtl">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        {CATEGORY_ORDER.map((cat) => (
          <option key={cat} value={cat}>
            {(formLang === "en" ? CATEGORIES[cat]?.labelEn : CATEGORIES[cat]?.label) ?? cat}
          </option>
        ))}
      </select>
      <Input
        placeholder="תיאור הפריט (חובה)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
      />
      <Textarea
        placeholder="פירוט נוסף (אופציונלי)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="h-16 resize-none text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          הוסף
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </div>
  );
}

// ── Single item row ───────────────────────────────────────────────────────────

function ItemRow({
  item,
  projectId,
  onUpdate,
  onDelete,
}: {
  item: ChecklistItem;
  projectId: string;
  onUpdate: (updated: ChecklistItem) => void;
  onDelete: (id: string) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const updated = await api.updateChecklistItem(projectId, item.id, {
        is_completed: !item.is_completed,
      });
      onUpdate(updated);
    } catch {
      toast.error("שגיאה בעדכון");
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteChecklistItem(projectId, item.id);
      onDelete(item.id);
    } catch {
      toast.error("שגיאה במחיקה");
    } finally {
      setDeleting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadChecklistFile(projectId, item.id, file);
      const updated = await api.updateChecklistItem(projectId, item.id, { is_completed: true });
      onUpdate(updated);
      toast.success(`"${file.name}" הועלה והפריט סומן כהושלם`);
    } catch (err) {
      toast.error(`שגיאה בהעלאה: ${err instanceof Error ? err.message : err}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div
      className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 ${item.is_completed ? "opacity-60" : ""}`}
      dir="rtl"
    >
      {/* Checkbox */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-700 disabled:opacity-50"
        title={item.is_completed ? "סמן כלא-הושלם" : "סמן כהושלם"}
      >
        {toggling ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : item.is_completed ? (
          <CheckSquare className="h-4 w-4 text-emerald-600" />
        ) : (
          <div className="h-4 w-4 rounded border-2 border-slate-300" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium leading-snug ${item.is_completed ? "line-through text-slate-400" : "text-slate-800"}`}
        >
          {item.title}
        </p>
        {item.description && (
          <p className="mt-0.5 text-xs text-slate-500 leading-snug">{item.description}</p>
        )}
        {item.is_completed && item.completed_by && (
          <p className="mt-0.5 text-xs text-emerald-600">
            הושלם על-ידי {item.completed_by}
          </p>
        )}
      </div>

      {/* Upload file */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-blue-500 transition-opacity disabled:opacity-50"
        title="צרף מסמך"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity disabled:opacity-50"
        title="מחק פריט"
      >
        {deleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  category,
  items,
  projectId,
  onUpdate,
  onDelete,
  lang: catLang,
}: {
  category: string;
  items: ChecklistItem[];
  projectId: string;
  onUpdate: (updated: ChecklistItem) => void;
  onDelete: (id: string) => void;
  lang: import("@/lib/i18n").Lang;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = CATEGORIES[category] ?? CATEGORIES.other;
  const catLabel = catLang === "en" ? cfg.labelEn : cfg.label;
  const done = items.filter((i) => i.is_completed).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full px-4 py-3 text-right hover:bg-slate-50 transition-colors"
        dir="rtl"
      >
        <div className="flex items-center gap-2.5">
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${cfg.color}`}>
            {cfg.icon}
            {catLabel}
          </span>
          <span className="text-xs text-slate-400">
            {done}/{items.length}
          </span>
          {done === items.length && items.length > 0 && (
            <span className="text-xs text-emerald-600 font-medium">✓ {t("completed", catLang)}</span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              projectId={projectId}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ChecklistPanel({ projectId }: { projectId: string }) {
  const { lang } = useLanguage();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.listChecklist(projectId);
      setItems(data);
    } catch {
      // ignore (project might not have any items yet)
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await api.generateChecklist(projectId);
      setItems(data);
      toast.success("רשימת ההשלמות נוצרה בהצלחה");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה ביצירת הרשימה";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await api.exportChecklistWord(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("שגיאה בייצוא");
    } finally {
      setExporting(false);
    }
  };

  const handleUpdate = (updated: ChecklistItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleAdded = (item: ChecklistItem) => {
    setItems((prev) => [...prev, item]);
    setShowAddForm(false);
  };

  // Group by category
  const grouped: Record<string, ChecklistItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  const orderedCategories = CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0);

  const totalDone = items.filter((i) => i.is_completed).length;
  const totalItems = items.length;
  const pct = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">רשימת השלמות</h2>
          {totalItems > 0 && (
            <p className="text-sm text-slate-500 mt-0.5">
              {totalDone} מתוך {totalItems} הושלמו
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerate}
            disabled={generating}
            className="gap-1.5"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {generating ? "" : t("checklist_refresh", lang)}
          </Button>
          {items.length > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddForm((s) => !s)}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("checklist_add", lang)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={exporting}
                className="gap-1.5"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                {t("checklist_export", lang)}
              </Button>
              <Button size="sm" onClick={() => setShowShare(true)} className="gap-1.5">
                <Send className="h-3.5 w-3.5" />
                {t("checklist_share", lang)}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {totalItems > 0 && (
        <div className="space-y-1.5">
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>{pct}% {t("completed", lang)}</span>
            <span>{totalItems - totalDone} {t("pending", lang)}</span>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <AddItemForm
          projectId={projectId}
          onAdded={handleAdded}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : totalItems === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 py-14 text-center">
          <CheckSquare className="h-10 w-10 text-slate-300" />
          <div>
            <p className="font-medium text-slate-600">{t("checklist_title", lang)}</p>
            <p className="mt-1 text-sm text-slate-400">
              {t("checklist_empty", lang)}
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("checklist_refresh", lang)}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {orderedCategories.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              items={grouped[cat]}
              projectId={projectId}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              lang={lang}
            />
          ))}
        </div>
      )}

      {showShare && (
        <ShareDialog projectId={projectId} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
