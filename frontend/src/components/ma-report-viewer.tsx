"use client";

/**
 * MaReportViewer — lightweight 10-chapter accordion for M&A v1 DD reports.
 *
 * Deliberately minimal: we reuse ``PdfCitationViewer`` (the same component
 * the finance viewer uses) and resolve citations by opening the source file
 * via ``getFileViewUrl`` + the ``bounding_boxes`` already present on each
 * source ref. No new backend endpoint is needed for v1.
 *
 * For richer features (QA banner, export buttons, completeness polish) we
 * want to share subcomponents with ReportViewer later, but for design-partner
 * preview this standalone viewer is enough.
 */

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import * as api from "@/lib/api";
import type {
  MaChapterId,
  MaChapterOutput,
  MaDDReport,
  MaFinding,
  MaFollowUp,
  ProjectFile,
  SourceRef,
} from "@/lib/types";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PdfCitationViewer = dynamic(
  () =>
    import("@/components/pdf-citation-viewer").then(
      (mod) => mod.PdfCitationViewer,
    ),
  { ssr: false },
);

const CHAPTER_ORDER: MaChapterId[] = [
  "transaction_overview",
  "corporate_governance",
  "customer_obligations",
  "supplier_obligations",
  "hr",
  "regulatory",
  "litigation",
  "taxation",
  "financial_debt",
  "insurance",
];

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-slate-50 text-slate-700 border-slate-200",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "קריטי",
  warning: "אזהרה",
  info: "מידע",
};

function normalizeName(s: string): string {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\.(pdf|png|jpg|jpeg|tif|tiff)$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[\u2022•·]/g, " ");
}

function findFileIdByDocumentName(
  docName: string,
  files: ProjectFile[] | undefined,
): string | null {
  if (!files?.length) return null;
  const target = normalizeName(docName);
  const exact = files.find((f) => normalizeName(f.original_name) === target);
  if (exact) return exact.id;
  const starts = files.find((f) =>
    normalizeName(f.original_name).startsWith(target),
  );
  if (starts) return starts.id;
  const loose = files.find(
    (f) =>
      normalizeName(f.original_name).includes(target) ||
      target.includes(normalizeName(f.original_name)),
  );
  return loose?.id ?? null;
}

interface MaReportViewerProps {
  report: MaDDReport;
  projectTitle: string;
  projectId?: string;
  projectFiles?: ProjectFile[];
}

export function MaReportViewer({
  report,
  projectTitle,
  projectId,
  projectFiles,
}: MaReportViewerProps) {
  const [citationOpen, setCitationOpen] = useState(false);
  const [citationLoading, setCitationLoading] = useState(false);
  const [citationUrl, setCitationUrl] = useState<string | null>(null);
  const [citationPage, setCitationPage] = useState<number>(1);
  const [citationBoxes, setCitationBoxes] = useState<
    { x0: number; y0: number; x1: number; y1: number }[]
  >([]);
  const [citationTitle, setCitationTitle] = useState<string>("");
  const [citationQuote, setCitationQuote] = useState<string>("");
  const urlCacheRef = useRef<Map<string, { url: string; at: number }>>(
    new Map(),
  );

  const header = report.project_header;
  const chaptersById = useMemo(() => {
    const map = new Map<string, MaChapterOutput>();
    (report.chapters || []).forEach((c) => map.set(c.chapter_id, c));
    return map;
  }, [report.chapters]);

  async function openCitation(source: SourceRef) {
    if (!projectId || !projectFiles?.length) return;
    setCitationOpen(true);
    setCitationTitle(source.source_document_name);
    setCitationPage(source.page_number);
    setCitationBoxes(source.bounding_boxes || []);
    setCitationQuote(source.verbatim_quote || "");

    const fileId = findFileIdByDocumentName(
      source.source_document_name,
      projectFiles,
    );
    if (!fileId) {
      setCitationUrl(null);
      return;
    }
    const cacheKey = `${projectId}:${fileId}`;
    const cached = urlCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
      setCitationUrl(cached.url);
      return;
    }
    setCitationLoading(true);
    try {
      const res = await api.getFileViewUrl(projectId, fileId);
      urlCacheRef.current.set(cacheKey, { url: res.url, at: Date.now() });
      setCitationUrl(res.url);
    } catch {
      setCitationUrl(null);
    } finally {
      setCitationLoading(false);
    }
  }

  const completeness = report.completeness;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            {header?.project_name || projectTitle}
          </CardTitle>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600 dark:text-slate-300">
            {header?.client_name ? (
              <span>לקוח: {header.client_name}</span>
            ) : null}
            {header?.representing_role ? (
              <span>מייצגים: {header.representing_role}</span>
            ) : null}
            {header?.counterparty_name ? (
              <span>צד שכנגד: {header.counterparty_name}</span>
            ) : null}
            {typeof header?.doc_count === "number" ? (
              <span>{header.doc_count} מסמכים</span>
            ) : null}
          </div>
        </CardHeader>
        {report.executive_summary ? (
          <CardContent>
            <div className="flex items-start gap-3">
              <Badge
                variant="outline"
                className={`shrink-0 ${
                  SEVERITY_CLASSES[
                    report.executive_summary.risk_level === "high"
                      ? "critical"
                      : report.executive_summary.risk_level === "medium"
                        ? "warning"
                        : "info"
                  ]
                }`}
              >
                רמת סיכון:{" "}
                {report.executive_summary.risk_level === "high"
                  ? "גבוהה"
                  : report.executive_summary.risk_level === "medium"
                    ? "בינונית"
                    : "נמוכה"}
              </Badge>
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                {report.executive_summary.summary}
              </p>
            </div>
          </CardContent>
        ) : null}
      </Card>

      {/* Chapters */}
      <Card className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">פרקי הדוח</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHAPTER_ORDER.map((id) => {
            const chapter = chaptersById.get(id);
            if (!chapter) return null;
            return (
              <ChapterSection
                key={id}
                chapter={chapter}
                onOpenSource={openCitation}
              />
            );
          })}
        </CardContent>
      </Card>

      {/* Completeness checklist */}
      {completeness && completeness.items.length > 0 ? (
        <Card className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">השלמות נדרשות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {completeness.summary_he ? (
              <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                {completeness.summary_he}
              </p>
            ) : null}
            <ul className="space-y-2">
              {completeness.items.map((it) => (
                <li
                  key={it.id}
                  className={`rounded-xl border p-3 ${SEVERITY_CLASSES[it.severity] || ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {it.description}
                      </div>
                      {it.suggested_document ? (
                        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          מסמך מוצע: {it.suggested_document}
                        </div>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {SEVERITY_LABELS[it.severity] || it.severity}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={citationOpen} onOpenChange={setCitationOpen}>
        <DialogContent className="left-4 right-4 bottom-4 top-16 sm:left-6 sm:right-6 lg:left-10 lg:right-10 flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-none">
          <DialogHeader className="border-b p-4">
            <DialogTitle className="text-right text-sm font-semibold">
              {citationTitle || "ציטוט מהמסמך"}
            </DialogTitle>
          </DialogHeader>
          {citationQuote ? (
            <div className="border-b bg-amber-50 px-4 py-3 text-right text-sm text-amber-900">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                ציטוט
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">
                {citationQuote}
              </div>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 justify-center overflow-y-auto p-3">
            {citationLoading ? (
              <div className="flex h-64 items-center justify-center text-slate-500">
                טוען...
              </div>
            ) : citationUrl && citationPage ? (
              <div className="w-full">
                <PdfCitationViewer
                  url={citationUrl}
                  pageNumber={citationPage}
                  boundingBoxes={citationBoxes}
                  maxWidth={720}
                  heightClassName="min-h-0"
                  allPages
                  scrollToPage={citationPage}
                />
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">
                לא ניתן לטעון את המסמך
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChapterSection({
  chapter,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  onOpenSource: (src: SourceRef) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-slate-200 dark:border-slate-800"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-3 text-right hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <span className="font-semibold">{chapter.chapter_title_he}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {chapter.empty_state ? (
            <Badge variant="outline">אין מסמכים</Badge>
          ) : (
            <>
              <Badge variant="outline">{chapter.findings.length} ממצאים</Badge>
              {chapter.follow_ups.length > 0 ? (
                <Badge
                  variant="outline"
                  className="border-amber-300 text-amber-700"
                >
                  {chapter.follow_ups.length} השלמות
                </Badge>
              ) : null}
            </>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 border-t border-slate-200 p-3 dark:border-slate-800">
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
            {chapter.summary_he}
          </p>
          {chapter.findings.length > 0 ? (
            <FindingsList
              findings={chapter.findings}
              onOpenSource={onOpenSource}
            />
          ) : null}
          {chapter.follow_ups.length > 0 ? (
            <FollowUpsList followUps={chapter.follow_ups} />
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FindingsList({
  findings,
  onOpenSource,
}: {
  findings: MaFinding[];
  onOpenSource: (src: SourceRef) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        ממצאים
      </div>
      <ul className="space-y-2">
        {findings.map((f) => (
          <li
            key={f.id}
            className={`rounded-xl border p-3 ${SEVERITY_CLASSES[f.severity] || ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {f.subsection}
                  </Badge>
                  <span className="font-semibold">{f.title}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                  {f.description}
                </p>
                {f.sources && f.sources.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {f.sources.map((s, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full px-3 text-xs"
                        onClick={() => onOpenSource(s)}
                      >
                        {s.source_document_name} · עמ׳ {s.page_number}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <Badge variant="outline" className="shrink-0">
                {SEVERITY_LABELS[f.severity] || f.severity}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FollowUpsList({ followUps }: { followUps: MaFollowUp[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        השלמות נדרשות
      </div>
      <ul className="space-y-2">
        {followUps.map((fu) => (
          <li
            key={fu.id}
            className={`rounded-xl border p-3 ${SEVERITY_CLASSES[fu.severity] || ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm">{fu.description}</div>
                {fu.suggested_document ? (
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    מסמך מוצע: {fu.suggested_document}
                  </div>
                ) : null}
              </div>
              <Badge variant="outline" className="shrink-0">
                {SEVERITY_LABELS[fu.severity] || fu.severity}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
