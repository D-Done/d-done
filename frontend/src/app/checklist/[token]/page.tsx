"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Circle,
  FileUp,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import * as api from "@/lib/api";
import type { ChecklistItem, PublicChecklist } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CATEGORY_LABELS: Record<string, string> = {
  signing: "חתימות חסרות",
  warning_note: "הערות אזהרה",
  mortgage: "משכנתאות",
  missing_doc: "מסמכים חסרים",
  lender: "גוף המממן",
  corporate: "תאגידי",
  other: "אחר",
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

function UploadItemDialog({
  token,
  item,
  onDone,
  onClose,
}: {
  token: string;
  item: ChecklistItem;
  onDone: (itemId: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploaderName, setUploaderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      await api.publicUploadChecklistFile(token, item.id, file, uploaderName);
      setSuccess(true);
      onDone(item.id);
    } catch {
      setError("שגיאה בהעלאת הקובץ. אנא נסה שנית.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 space-y-4" dir="rtl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">העלאת מסמך</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-center font-medium text-slate-800">הקובץ הועלה בהצלחה!</p>
            <p className="text-center text-sm text-slate-500">הפריט סומן כהושלם.</p>
            <Button className="mt-2" onClick={onClose}>סגור</Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium">{item.title}</p>
              {item.description && (
                <p className="mt-1 text-slate-500">{item.description}</p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">שמך (אופציונלי)</label>
                <input
                  type="text"
                  value={uploaderName}
                  onChange={(e) => setUploaderName(e.target.value)}
                  placeholder="לדוגמה: ישראל ישראלי"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">קובץ לצירוף</label>
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-1 w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-6 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                  {file ? (
                    <>
                      <FileUp className="h-5 w-5 text-blue-500" />
                      <span className="font-medium text-blue-600">{file.name}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      לחץ לבחירת קובץ
                    </>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="flex-1 gap-2"
                onClick={handleUpload}
                disabled={!file || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                העלה מסמך
              </Button>
              <Button variant="outline" onClick={onClose}>ביטול</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  token,
  onCompleted,
}: {
  item: ChecklistItem;
  token: string;
  onCompleted: (itemId: string) => void;
}) {
  const [showUpload, setShowUpload] = useState(false);

  return (
    <>
      <div
        className={[
          "flex items-start gap-3 rounded-xl border p-3 transition-colors",
          item.is_completed
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-slate-200 bg-white hover:border-slate-300",
        ].join(" ")}
        dir="rtl"
      >
        <div className="mt-0.5 shrink-0">
          {item.is_completed ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <Circle className="h-5 w-5 text-slate-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={[
              "text-sm font-medium",
              item.is_completed ? "text-slate-400 line-through" : "text-slate-800",
            ].join(" ")}
          >
            {item.title}
          </p>
          {item.description && (
            <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
          )}
          {item.is_completed && item.completed_by && (
            <p className="mt-1 text-xs text-emerald-600">
              הושלם על ידי {item.completed_by}
            </p>
          )}
        </div>
        {!item.is_completed && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1 rounded-lg text-xs"
            onClick={() => setShowUpload(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            העלה
          </Button>
        )}
      </div>

      {showUpload && (
        <UploadItemDialog
          token={token}
          item={item}
          onDone={(id) => {
            onCompleted(id);
            setShowUpload(false);
          }}
          onClose={() => setShowUpload(false)}
        />
      )}
    </>
  );
}

export default function PublicChecklistPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<PublicChecklist | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPublicChecklist(token)
      .then((res) => {
        setData(res);
        setItems(res.items);
      })
      .catch(() => {
        setError("הקישור לא תקין או שפג תוקפו.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const markCompleted = (itemId: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, is_completed: true, completed_at: new Date().toISOString() }
          : i,
      ),
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <h1 className="text-xl font-bold text-slate-800">
          {error ?? "שגיאה בטעינת הדף"}
        </h1>
        <p className="text-sm text-slate-500">
          הקישור ייתכן ופג תוקפו או אינו תקין. אנא פנה לשולח ההזמנה.
        </p>
      </div>
    );
  }

  const total = items.length;
  const done = items.filter((i) => i.is_completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const grouped: Record<string, ChecklistItem[]> = {};
  for (const item of items) {
    (grouped[item.category] ??= []).push(item);
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-7 w-7 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 truncate">
                רשימת השלמות — {data.project_name}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                העלה את המסמכים הנדרשים על ידי לחיצה על &quot;העלה&quot; ליד כל פריט
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500">
              <span>{done} / {total} הושלמו</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        {total === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            אין פריטים ברשימת ההשלמות
          </div>
        )}

        {CATEGORY_ORDER.map((cat) => {
          const catItems = grouped[cat];
          if (!catItems?.length) return null;
          const catDone = catItems.filter((i) => i.is_completed).length;
          return (
            <div key={cat} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-700">
                  {CATEGORY_LABELS[cat] ?? cat}
                </h2>
                <Badge
                  variant="outline"
                  className="rounded-full text-xs px-2 py-0"
                >
                  {catDone}/{catItems.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {catItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    token={token}
                    onCompleted={markCompleted}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {done === total && total > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="font-bold text-emerald-800">כל הפריטים הושלמו!</p>
            <p className="text-sm text-emerald-600">
              תודה על שיתוף הפעולה. הצד המזמין יקבל עדכון בקרוב.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
