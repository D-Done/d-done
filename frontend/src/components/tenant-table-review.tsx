"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertTriangle,
  Send,
  FileText,
  MapPin,
  Loader2,
  Minus,
  Plus,
  ZoomIn,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFileViewUrl, getHitlReviewData, approveTenantTable } from "@/lib/api";
import type { HitlTenantData } from "@/lib/api";
import type { BoundingBox } from "@/lib/types";
import type { ProjectFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DOC_TYPE_LABELS, getDocTypeDisplayLabel } from "@/lib/constants";
import type { DocumentType } from "@/lib/types";

const PdfCitationViewer = dynamic(
  () =>
    import("@/components/pdf-citation-viewer").then((m) => m.PdfCitationViewer),
  { ssr: false },
);

type TenantRecord = HitlTenantData["tenant_records"][0];

function box2dToBoundingBox(box2d: number[]): BoundingBox {
  const [yMin, xMin, yMax, xMax] = box2d;
  return {
    x0: xMin / 1000,
    y0: yMin / 1000,
    x1: xMax / 1000,
    y1: yMax / 1000,
  };
}

/** Build one envelope box per page covering the entire tenant table (union of all row boxes). */
function buildBoundingBoxesByPage(
  records: TenantRecord[],
): Record<number, BoundingBox[]> {
  const byPage: Record<number, BoundingBox[]> = {};
  for (const r of records) {
    const src = r.source;
    if (!src?.box_2d || !Array.isArray(src.box_2d) || src.box_2d.length !== 4)
      continue;
    const page = Number(src.page_number) || 1;
    if (!byPage[page]) byPage[page] = [];
    byPage[page].push(box2dToBoundingBox(src.box_2d));
  }
  // Merge all boxes per page into one envelope (entire table highlight)
  const result: Record<number, BoundingBox[]> = {};
  for (const [pageStr, boxes] of Object.entries(byPage)) {
    if (boxes.length === 0) continue;
    const page = Number(pageStr);
    const envelope: BoundingBox = {
      x0: Math.min(...boxes.map((b) => b.x0)),
      y0: Math.min(...boxes.map((b) => b.y0)),
      x1: Math.max(...boxes.map((b) => b.x1)),
      y1: Math.max(...boxes.map((b) => b.y1)),
    };
    result[page] = [envelope];
  }
  return result;
}

function matchFileByDocName(
  files: ProjectFile[],
  docName: string,
): ProjectFile | null {
  return (
    files.find(
      (f) =>
        f.original_name === docName ||
        f.original_name.includes(docName) ||
        docName.includes(f.original_name),
    ) ?? null
  );
}

function cleanSubParcel(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s*[\u0028\u005B\u0029\u005D].*$/, "").trim();
}

interface DocGroup {
  key: string;
  label: string;
  fileId: string | null;
  file: ProjectFile | null;
  rowIndices: number[];
}

function groupByDocument(
  rows: TenantRecord[],
  files: ProjectFile[],
): DocGroup[] {
  const map = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const docKey = r.source?.source_document_name ?? "__unknown__";
    if (!map.has(docKey)) map.set(docKey, []);
    map.get(docKey)!.push(i);
  });

  const groups: DocGroup[] = [];
  for (const [docName, indices] of map) {
    const matched = docName !== "__unknown__"
      ? matchFileByDocName(files, docName)
      : null;
    const label =
      matched
        ? getDocTypeDisplayLabel(matched.original_name, matched.doc_type) +
          " — " +
          matched.original_name
        : docName === "__unknown__"
          ? "ללא מסמך מקור"
          : docName;
    groups.push({
      key: docName,
      label,
      fileId: matched?.id ?? null,
      file: matched,
      rowIndices: indices,
    });
  }
  return groups;
}

const yn = (v: boolean | null | undefined) =>
  v == null ? "—" : v ? "כן" : "לא";

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const BASE_PDF_WIDTH = 680;

type ReviewMode = "review" | "correction";

export function TenantTableReview({
  projectId,
  checkId,
  files,
  onApproved,
  onCorrectionSent,
  className,
}: {
  projectId: string;
  checkId: string;
  files: ProjectFile[];
  onApproved?: () => void;
  onCorrectionSent?: () => void;
  className?: string;
}) {
  const [data, setData] = useState<HitlTenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [scrollToPage, setScrollToPage] = useState<number | null>(null);
  const [mode, setMode] = useState<ReviewMode>("review");
  const [correctionText, setCorrectionText] = useState("");
  const [approving, setApproving] = useState(false);
  const [sending, setSending] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(2);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);

  const zoom = ZOOM_STEPS[zoomIdx];
  const pdfMaxWidth = Math.round(BASE_PDF_WIDTH * zoom);

  const fetchReviewData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hitlData = await getHitlReviewData(projectId, checkId);
      setData(hitlData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load review data");
    } finally {
      setLoading(false);
    }
  }, [projectId, checkId]);

  useEffect(() => {
    fetchReviewData();
  }, [fetchReviewData]);

  const [rows, setRows] = useState<TenantRecord[]>([]);
  useEffect(() => {
    if (data?.tenant_records) {
      setRows(
        data.tenant_records.map((r) => ({
          ...r,
          sub_parcel: cleanSubParcel(r.sub_parcel),
        })),
      );
    }
  }, [data?.tenant_records]);

  const uploadedFiles = useMemo(
    () => files.filter((f) => f.upload_status === "uploaded"),
    [files],
  );

  const docGroups = useMemo(
    () => groupByDocument(rows, uploadedFiles),
    [rows, uploadedFiles],
  );

  const activeGroup = docGroups[activeGroupIdx] ?? docGroups[0] ?? null;

  useEffect(() => {
    if (!activeGroup) return;
    const targetFileId = activeGroup.fileId;
    if (targetFileId && targetFileId !== selectedFileId) {
      setSelectedFileId(targetFileId);
    } else if (!targetFileId && !selectedFileId && uploadedFiles.length > 0) {
      setSelectedFileId(uploadedFiles[0].id);
    }
  }, [activeGroup, uploadedFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedFileId) return;
    let cancelled = false;
    setPdfLoading(true);
    setPdfUrl(null);
    (async () => {
      try {
        const { url } = await getFileViewUrl(projectId, selectedFileId);
        if (!cancelled) setPdfUrl(url);
      } catch {
        if (!cancelled) setPdfUrl(null);
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedFileId]);

  const activeRows = useMemo(
    () => (activeGroup ? activeGroup.rowIndices.map((i) => ({ idx: i, row: rows[i] })) : []),
    [activeGroup, rows],
  );

  const boundingBoxesByPage = useMemo(
    () => buildBoundingBoxesByPage(activeRows.map((r) => r.row)),
    [activeRows],
  );

  const firstCitationPage = useMemo(() => {
    const pagesWithBoxes = Object.entries(boundingBoxesByPage)
      .filter(([, boxes]) => boxes.length > 0)
      .map(([p]) => Number(p))
      .filter((p) => p > 0);
    return pagesWithBoxes.length > 0 ? Math.min(...pagesWithBoxes) : null;
  }, [boundingBoxesByPage]);

  // Scroll PDF to the first page with citation boxes when doc group or data loads
  useEffect(() => {
    if (firstCitationPage != null) setScrollToPage(firstCitationPage);
  }, [firstCitationPage]);

  // Clear selected row when switching doc groups
  useEffect(() => {
    setSelectedRowIdx(null);
  }, [activeGroupIdx]);

  const signedCount = useMemo(
    () => activeRows.filter((r) => r.row.is_signed === true).length,
    [activeRows],
  );
  const totalCount = activeRows.length;
  const signingPct =
    totalCount > 0 ? Math.round((signedCount / totalCount) * 100) : 0;

  const updateRow = useCallback(
    (globalIndex: number, patch: Partial<TenantRecord>) => {
      setRows((prev) => {
        const next = [...prev];
        if (globalIndex < 0 || globalIndex >= next.length) return prev;
        next[globalIndex] = { ...next[globalIndex], ...patch };
        return next;
      });
    },
    [],
  );

  const handleApprove = useCallback(async () => {
    setApproving(true);
    try {
      await approveTenantTable(projectId, checkId, rows);
      onApproved?.();
    } catch (e) {
      console.error("Approve failed:", e);
      toast.error("האישור נכשל — נסה שוב");
    } finally {
      setApproving(false);
    }
  }, [projectId, checkId, rows, onApproved]);

  const handleSendCorrection = useCallback(async () => {
    if (!correctionText.trim()) return;
    const text = correctionText.trim();
    setSending(true);
    try {
      await approveTenantTable(projectId, checkId, rows, text);
      onCorrectionSent?.();
    } catch (e) {
      console.error("Correction send failed:", e);
      toast.error("שליחת התיקון נכשלה — נסה שוב");
    } finally {
      setSending(false);
    }
  }, [projectId, checkId, rows, correctionText, onCorrectionSent]);

  const scrollToRowPage = useCallback((page: number, rowIdx?: number) => {
    setScrollToPage(page);
    setSelectedRowIdx(rowIdx ?? null);
  }, []);

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        {loading ? "טוען נתוני סקירה..." : "אין נתונים לסקירה"}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid h-[calc(100vh-8rem)] grid-rows-[auto_1fr_auto] overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950",
        className,
      )}
      dir="rtl"
    >
      {/* Header */}
      <div className="min-h-0 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              סקירת טבלת חתימות דיירים
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              בדוק את הנתונים שזוהו מהמסמך. אשר אם נכון, או הצע שינויים אם נדרש.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {data.block && (
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <MapPin className="h-4 w-4 text-indigo-500" />
                <span className="font-medium">גוש:</span>
                <span className="font-mono">{data.block}</span>
              </div>
            )}
            {data.parcel && (
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <FileText className="h-4 w-4 text-indigo-500" />
                <span className="font-medium">חלקה:</span>
                <span className="font-mono">{data.parcel}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content: PDF + Table side by side */}
      <div className="grid min-h-0 grid-cols-[55%_1fr] overflow-hidden">
        {/* PDF Viewer — scrolls independently */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-slate-200 dark:border-slate-800">
          {/* PDF toolbar */}
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="relative flex min-w-0 flex-1 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
              <label className="sr-only" htmlFor="tenant-review-doc-select">
                בחר מסמך
              </label>
              <select
                id="tenant-review-doc-select"
                value={selectedFileId ?? ""}
                onChange={(e) => setSelectedFileId(e.target.value || null)}
                className="w-full min-w-0 flex-1 appearance-none truncate rounded-lg border-2 border-slate-200 bg-white py-2 pl-8 pr-3 text-sm font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-indigo-400"
                dir="rtl"
                aria-label="בחר מסמך להצגה"
              >
                {uploadedFiles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {getDocTypeDisplayLabel(f.original_name, f.doc_type)} — {f.original_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                disabled={zoomIdx === 0}
                onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
                aria-label="הקטן זום"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-sm font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                disabled={zoomIdx === ZOOM_STEPS.length - 1}
                onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
                aria-label="הגדל זום"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => setZoomIdx(2)}
                title="אפס זום ל־100%"
                aria-label="אפס זום"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="h-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-slate-50 dark:bg-slate-900/50">
            {pdfLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                טוען מסמך...
              </div>
            ) : pdfUrl ? (
              <PdfCitationViewer
                url={pdfUrl}
                pageNumber={1}
                boundingBoxesByPage={boundingBoxesByPage}
                allPages
                scrollToPage={scrollToPage ?? undefined}
                heightClassName="min-h-0"
                maxWidth={pdfMaxWidth}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                לא ניתן לטעון את המסמך
              </div>
            )}
          </div>
        </div>

        {/* Table + Actions — scrolls independently */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {/* Document group tabs */}
          {docGroups.length > 1 && (
            <div className="shrink-0 flex gap-0 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
              {docGroups.map((g, gi) => {
                const grpRows = g.rowIndices.map((i) => rows[i]);
                const grpSigned = grpRows.filter((r) => r.is_signed).length;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setActiveGroupIdx(gi)}
                    className={cn(
                      "shrink-0 px-4 py-2 text-xs font-medium transition-colors border-b-2",
                      gi === activeGroupIdx
                        ? "border-indigo-500 text-indigo-700 bg-indigo-50/50 dark:text-indigo-300 dark:bg-indigo-950/20"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900/30",
                    )}
                  >
                    <span className="block truncate max-w-[180px]">{g.label}</span>
                    <span className="text-[10px] opacity-70">
                      {grpSigned}/{grpRows.length} חתמו
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Signing stats bar */}
          <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              אחוז חתימות:{" "}
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {signingPct}%
              </span>{" "}
              ({signedCount} מתוך {totalCount})
            </span>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${signingPct}%` }}
              />
            </div>
          </div>

          {/* Tenant table */}
          <div className="h-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain border border-slate-200 dark:border-slate-800 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 dark:bg-slate-900/50">
                  <TableHead className="text-xs w-16">תת חלקה</TableHead>
                  <TableHead className="text-xs">שם דייר / בעלים</TableHead>
                  <TableHead className="text-xs text-center">חתמה</TableHead>
                  <TableHead className="text-xs w-12 text-center">עמוד</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:last-child]:border-b [&_tr:last-child]:border-slate-200 dark:[&_tr:last-child]:border-slate-800">
                {activeRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                    >
                      {rows.length === 0
                        ? "אין רשומות לסקירה — לא זוהו חתימות דיירים במסמך"
                        : "אין רשומות בקבוצה זו"}
                    </TableCell>
                  </TableRow>
                ) : (
                  activeRows.map(({ idx, row: t }) => (
                  <TableRow
                    key={idx}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedRowIdx === idx
                        ? "bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800"
                        : "hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20",
                    )}
                    onClick={() =>
                      t.source?.page_number &&
                      scrollToRowPage(t.source.page_number, idx)
                    }
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      <input
                        type="text"
                        value={t.sub_parcel ?? ""}
                        onChange={(e) =>
                          updateRow(idx, { sub_parcel: e.target.value })
                        }
                        className="w-14 rounded-md border border-slate-200 bg-transparent px-2 py-1 font-mono text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="text"
                        value={t.owner_name ?? ""}
                        onChange={(e) =>
                          updateRow(idx, { owner_name: e.target.value })
                        }
                        className="w-full rounded-md border border-slate-200 bg-transparent px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={t.is_signed === true}
                          onChange={(e) =>
                            updateRow(idx, { is_signed: e.target.checked })
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <Badge
                          variant={t.is_signed ? "default" : "outline"}
                          className={cn(
                            "rounded-full text-xs",
                            t.is_signed
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
                          )}
                        >
                          {yn(t.is_signed)}
                        </Badge>
                      </label>
                    </TableCell>
                    <TableCell className="text-center">
                      {t.source?.page_number ? (
                        <button
                          type="button"
                          className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
                          onClick={(e) => {
                            e.stopPropagation();
                            scrollToRowPage(t.source!.page_number!, idx);
                          }}
                        >
                          {t.source.page_number}
                        </button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Correction prompt area */}
          {mode === "correction" && (
            <div className="shrink-0 border-t border-slate-200 bg-amber-50/50 px-4 py-3 dark:border-slate-800 dark:bg-amber-950/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="flex-1">
                  <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                    תאר מה צריך לתקן — ההנחיה תישלח לסוכן ה-AI לניתוח מחדש
                  </p>
                  <textarea
                    value={correctionText}
                    onChange={(e) => setCorrectionText(e.target.value)}
                    placeholder="לדוגמה: בתת חלקה 3 השם שגוי, צריך להיות ישראל ישראלי. חלק מהחתימות לא זוהו בעמוד 5..."
                    className="w-full resize-none rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm placeholder:text-amber-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-amber-800 dark:bg-slate-900 dark:placeholder:text-amber-700"
                    rows={3}
                    dir="rtl"
                    autoFocus
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons — always visible at bottom (grid row 3) */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div>
          {mode === "review" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
              onClick={() => setMode("correction")}
            >
              <AlertTriangle className="ml-1.5 h-3.5 w-3.5" />
              הצע שינויים
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode("review")}
            >
              ביטול
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
          )}
          {mode === "correction" ? (
            <Button
              type="button"
              disabled={!correctionText.trim() || sending}
              onClick={handleSendCorrection}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {sending ? (
                <Loader2 className="ml-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="ml-1.5 h-4 w-4" />
              )}
              שלח תיקון
            </Button>
          ) : (
            <Button
              type="button"
              disabled={approving}
              onClick={handleApprove}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {approving ? (
                <Loader2 className="ml-1.5 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="ml-1.5 h-4 w-4" />
              )}
              אשר והמשך
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
