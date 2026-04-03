"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  FileDown,
  FileText,
  Gavel,
  Info,
  Landmark,
  Scale,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import * as api from "@/lib/api";
import type {
  BoundingBox,
  DDReport,
  Finding,
  FindingSeverity,
  ProjectFile,
  ContractualMilestone,
  UpgradeDowngradeInfo,
  RealEstateFinanceDDReport,
  RiskLevel,
  SourceRef,
  UboEdge,
  UboGraph,
  UboNode,
} from "@/lib/types";
import { RISK_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ProjectTimeline } from "@/components/ProjectTimeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

const PdfCitationViewer = dynamic(
  () =>
    import("@/components/pdf-citation-viewer").then(
      (mod) => mod.PdfCitationViewer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 w-full items-center justify-center bg-slate-50 dark:bg-slate-900 text-xs text-slate-400 dark:text-slate-500">
        טוען תצוגת מסמך...
      </div>
    ),
  },
);

interface ReportViewerProps {
  report: DDReport | RealEstateFinanceDDReport;
  projectTitle: string;
  projectId?: string;
  projectFiles?: ProjectFile[];
  /** When set, citation click uses GET /citation for signed URL + polygons (no client-side file resolve). */
  checkId?: string;
}

function normalizeName(s: string): string {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\.(pdf|png|jpg|jpeg|tif|tiff)$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[\u2022•·]/g, " "); // normalize bullet/middle-dot so "נריטה • pdf" matches "נריטה pdf"
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
  const contains = files.find((f) =>
    normalizeName(f.original_name).includes(target),
  );
  if (contains) return contains.id;
  // Report may use a shorter name; match if target is contained in file name
  const reverseContains = files.find((f) =>
    target.includes(normalizeName(f.original_name)),
  );
  return reverseContains?.id ?? null;
}

function isFinanceReport(report: unknown): report is RealEstateFinanceDDReport {
  return (
    typeof report === "object" && report !== null && "tenant_table" in report
  );
}

function isStandardDDReport(report: unknown): report is DDReport {
  return (
    typeof report === "object" &&
    report !== null &&
    "findings" in report &&
    "executive_summary" in report
  );
}

function SeverityIcon({ severity }: { severity: FindingSeverity }) {
  switch (severity) {
    case "critical":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case "info":
      return <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
  }
}

/* ─── Section wrapper for consistent styling ──────────────────────── */

function ReportSection({
  icon,
  title,
  tooltip,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  /** Optional tooltip shown on hover over the section title */
  tooltip?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const titleEl = (
    <CardTitle className="flex items-center gap-2.5 text-xl font-bold">
      <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2">{icon}</div>
      {title}
    </CardTitle>
  );
  return (
    <Card
      className={cn(
        "rounded-3xl border-none bg-white dark:bg-slate-900 shadow-sm overflow-hidden",
        className,
      )}
    >
      <CardHeader className="pb-3">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help inline-flex items-center gap-2.5">
                {titleEl}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[280px]">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          titleEl
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ─── Stat bubble for the compound details section ────────────────── */

function StatBubble({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-slate-50 dark:bg-slate-800/50 px-5 py-4 text-center min-w-[120px]">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{value}</span>
      {sub && <span className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</span>}
    </div>
  );
}

/* ─── Info row for key-value pairs ────────────────────────────────── */

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-b-0">
      <div className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">{label}</div>
      <div className="text-sm text-slate-900 dark:text-slate-100 flex-1 text-start">{value}</div>
    </div>
  );
}

/* ─── UBO ownership graph (tree) ──────────────────────────────────── */

function UboGraphView({ graph }: { graph: UboGraph }) {
  const nodeMap = useMemo(() => {
    const m = new Map<string, UboNode>();
    graph.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [graph.nodes]);

  const childrenByToId = useMemo(() => {
    const m = new Map<
      string,
      Array<{ node: UboNode; share_pct: string | null }>
    >();
    graph.edges.forEach((e: UboEdge) => {
      const node = nodeMap.get(e.from_id);
      if (!node) return;
      const list = m.get(e.to_id) ?? [];
      list.push({ node, share_pct: e.share_pct ?? null });
      m.set(e.to_id, list);
    });
    return m;
  }, [graph.edges, nodeMap]);

  const rootIds = useMemo(() => {
    const fromIds = new Set(graph.edges.map((e) => e.from_id));
    return graph.nodes.filter((n) => !fromIds.has(n.id)).map((n) => n.id);
  }, [graph.nodes, graph.edges]);

  function TreeNode({
    nodeId,
    sharePct,
  }: {
    nodeId: string;
    sharePct: string | null;
  }) {
    const node = nodeMap.get(nodeId);
    if (!node) return null;
    const children = childrenByToId.get(nodeId) ?? [];
    return (
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "rounded-xl border px-3 py-2 text-center min-w-[140px] max-w-[220px]",
            node.type === "company"
              ? "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              : "border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-900/30 text-slate-800 dark:text-slate-200",
          )}
        >
          <p className="text-sm font-medium wrap-break-word">{node.name}</p>
          {(node.company_number || node.id_number) && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {node.type === "company"
                ? `ח.פ. ${node.company_number}`
                : `ת.ז. ${node.id_number}`}
            </p>
          )}
          {sharePct && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium">
              {sharePct}
            </p>
          )}
        </div>
        {children.length > 0 && (
          <>
            <div className="w-px h-3 bg-slate-200 dark:bg-slate-600" />
            <div className="flex flex-wrap justify-center gap-4 pt-2">
              {children.map(({ node: child, share_pct }) => (
                <TreeNode
                  key={child.id}
                  nodeId={child.id}
                  sharePct={share_pct}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  if (rootIds.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-6 py-2">
      {rootIds.map((rid) => (
        <TreeNode key={rid} nodeId={rid} sharePct={null} />
      ))}
    </div>
  );
}

export function ReportViewer({
  report,
  projectTitle,
  projectId,
  projectFiles,
  checkId,
}: ReportViewerProps) {
  const yn = (v: boolean | null | undefined) =>
    v === null || typeof v === "undefined" ? "—" : v ? "כן" : "לא";

  const [citationOpen, setCitationOpen] = useState(false);
  const [citationLoading, setCitationLoading] = useState(false);
  const [citationUrl, setCitationUrl] = useState<string | null>(null);
  const [citationTitle, setCitationTitle] = useState<string>("");
  const [citationPage, setCitationPage] = useState<number | null>(null);
  const [citationQuote, setCitationQuote] = useState<string | null>(null);
  const [citationKey, setCitationKey] = useState<string>("");
  const [citationBoundingBoxes, setCitationBoundingBoxes] = useState<
    BoundingBox[]
  >([]);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const citationUrlCacheRef = useRef<Map<string, { url: string; at: number }>>(
    new Map(),
  );
  const [, forceCitationsRerender] = useState(0);

  const timelineEvents = useMemo(() => {
    const raw = Array.isArray(report.timeline) ? report.timeline : [];
    return raw
      .filter((e) => Boolean(e?.date) && Boolean(e?.event_description))
      .map((ev, idx) => ({
        date: ev.date,
        description: ev.event_description,
        source: ev.source?.source_document_name ?? "מסמכי הפרויקט",
        isHighlighted: idx === raw.length - 1,
      }));
  }, [report]);

  const canOpenCitations =
    !!projectId &&
    (!!projectFiles?.length || (!!checkId && typeof checkId === "string"));

  const ensureCitationUrl = useCallback(
    async (documentName: string): Promise<string | null> => {
      if (!projectId || !projectFiles?.length) return null;
      const fileId = findFileIdByDocumentName(documentName, projectFiles);
      if (!fileId) return null;

      const cacheKey = `${projectId}:${fileId}`;
      const cached = citationUrlCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.url;

      try {
        const res = await api.getFileViewUrl(projectId, fileId);
        citationUrlCacheRef.current.set(cacheKey, {
          url: res.url,
          at: Date.now(),
        });
        forceCitationsRerender((x) => x + 1);
        return res.url;
      } catch {
        return null;
      }
    },
    [projectFiles, projectId],
  );

  // Prefetch view URLs for all files cited in the report so first citation click is fast.
  useEffect(() => {
    if (!projectId || !projectFiles?.length) return;
    const names = new Set<string>();
    if (report?.findings?.length) {
      for (const f of report.findings) {
        for (const s of f.sources ?? []) {
          if (s?.source_document_name) names.add(s.source_document_name);
        }
      }
    }
    const fr = isFinanceReport(report) ? report : null;
    for (const s of fr?.tenant_table_signing_sources ?? []) {
      if (s?.source_document_name) names.add(s.source_document_name);
    }
    for (const s of fr?.tenant_table_warning_note_sources ?? []) {
      if (s?.source_document_name) names.add(s.source_document_name);
    }
    if (names.size === 0) return;
    const t = setTimeout(() => {
      for (const name of names) void ensureCitationUrl(name);
    }, 500);
    return () => clearTimeout(t);
  }, [report, projectId, projectFiles, ensureCitationUrl]);

  const CITATION_URL_CACHE_TTL_MS = 5 * 60 * 1000;

  async function openCitation(opts: {
    key: string;
    documentName: string;
    pageNumber: number;
    quoteHe?: string | null;
    boundingBoxes?: BoundingBox[];
    findingIndex?: number;
    sourceIndex?: number;
    citationSection?: "tenant_signing" | "tenant_warning_note";
  }) {
    setCitationKey(opts.key);
    setCitationTitle(opts.documentName);
    setCitationPage(opts.pageNumber);
    setCitationQuote(opts.quoteHe ?? null);
    setCitationBoundingBoxes(opts.boundingBoxes ?? []);
    setCitationUrl(null);
    setCitationOpen(true);

    const useSectionApi =
      projectId &&
      checkId &&
      opts.citationSection &&
      typeof opts.sourceIndex === "number";
    const useFindingApi =
      projectId &&
      checkId &&
      typeof opts.findingIndex === "number" &&
      typeof opts.sourceIndex === "number";

    if (useSectionApi) {
      setCitationLoading(true);
      try {
        const res = await api.getCitationView(
          projectId,
          checkId,
          -1,
          opts.sourceIndex!,
          opts.citationSection!,
        );
        setCitationUrl(res.view_url);
        setCitationPage(res.page_number);
        setCitationBoundingBoxes(res.bounding_boxes ?? []);
        if (res.document_name) setCitationTitle(res.document_name);
        setCitationLoading(false);
      } catch {
        setCitationUrl(null);
        setCitationLoading(false);
      }
      return;
    }

    if (useFindingApi) {
      setCitationLoading(true);
      try {
        const res = await api.getCitationView(
          projectId,
          checkId,
          opts.findingIndex!,
          opts.sourceIndex!,
        );
        setCitationUrl(res.view_url);
        setCitationPage(res.page_number);
        setCitationBoundingBoxes(res.bounding_boxes ?? []);
        if (res.document_name) setCitationTitle(res.document_name);
        setCitationLoading(false);
      } catch {
        setCitationUrl(null);
        setCitationLoading(false);
      }
      return;
    }

    if (!projectId || !projectFiles?.length) return;
    const fileId = findFileIdByDocumentName(opts.documentName, projectFiles);
    if (!fileId) return;

    const cacheKey = `${projectId}:${fileId}`;
    const cached = citationUrlCacheRef.current.get(cacheKey);

    if (cached && Date.now() - cached.at < CITATION_URL_CACHE_TTL_MS) {
      setCitationUrl(cached.url);
      setCitationLoading(false);
      return;
    }

    setCitationLoading(true);
    try {
      const res = await api.getFileViewUrl(projectId, fileId);
      citationUrlCacheRef.current.set(cacheKey, {
        url: res.url,
        at: Date.now(),
      });
      forceCitationsRerender((x) => x + 1);
      setCitationUrl(res.url);
    } catch {
      setCitationUrl(null);
    } finally {
      setCitationLoading(false);
    }
  }

  const exportReportToPdf = useCallback(async () => {
    if (!projectId || !checkId || exportingPdf) return;
    setExportingPdf(true);
    try {
      const { blob, filename } = await api.exportReportToPdf(projectId, checkId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }, 60_000);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExportingPdf(false);
    }
  }, [projectId, checkId, exportingPdf]);

  const exportReportToWord = useCallback(async () => {
    if (!projectId || !checkId || exportingWord) return;
    setExportingWord(true);
    try {
      const { blob, filename } = await api.exportReportToWord(projectId, checkId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }, 60_000);
    } catch (err) {
      console.error("Word export failed:", err);
    } finally {
      setExportingWord(false);
    }
  }, [projectId, checkId, exportingWord]);

  function CitationKey({
    source,
    index: sourceIndex,
    findingIndex,
  }: {
    source: SourceRef;
    index: number;
    findingIndex: number;
  }) {
    const key = `[${sourceIndex + 1}]`;
    const label = String(sourceIndex + 1);

    return (
      <button
        type="button"
        disabled={!canOpenCitations}
        className={cn(
          "inline-flex items-center justify-center min-w-5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white align-baseline transition-colors",
          canOpenCitations
            ? "bg-[#C7BFE8] hover:bg-[#B5A8D9]"
            : "bg-[#C7BFE8]/60 text-white/80 cursor-not-allowed",
        )}
        onClick={() => {
          if (!canOpenCitations) return;
          if (projectFiles?.length)
            void ensureCitationUrl(source.source_document_name);
          openCitation({
            key,
            documentName: source.source_document_name,
            pageNumber: source.page_number,
            quoteHe: source.verbatim_quote,
            boundingBoxes: source.bounding_boxes,
            findingIndex,
            sourceIndex,
          });
        }}
        title={`${source.source_document_name} • עמ' ${source.page_number}`}
      >
        {label}
      </button>
    );
  }

  function CitationKeysInline({
    sources,
    findingIndex,
  }: {
    sources: SourceRef[];
    findingIndex: number;
  }) {
    if (!Array.isArray(sources) || sources.length === 0) return null;
    return (
      <>
        {" "}
        {sources.map((s, i) => (
          <CitationKey
            key={i}
            source={s}
            index={i}
            findingIndex={findingIndex}
          />
        ))}
      </>
    );
  }

  function SectionCitationKeys({
    sources,
    citationSection,
  }: {
    sources: SourceRef[] | undefined;
    citationSection: "tenant_signing" | "tenant_warning_note";
  }) {
    // Only one citation per card: signing → project agreement (signing table), הערות ליזם → tabu extract
    const list = Array.isArray(sources) ? sources.slice(0, 1) : [];
    if (list.length === 0) return null;
    return (
      <>
        {" "}
        {list.map((s, i) => {
          const key = `s-${i + 1}`;
          const label = String(i + 1);
          return (
            <button
              key={i}
              type="button"
              disabled={!canOpenCitations}
              className={cn(
                "inline-flex items-center justify-center min-w-5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white align-baseline transition-colors",
                canOpenCitations
                  ? "bg-[#C7BFE8] hover:bg-[#B5A8D9]"
                  : "bg-[#C7BFE8]/60 text-white/80 cursor-not-allowed",
              )}
              onClick={() => {
                if (!canOpenCitations) return;
                if (projectFiles?.length)
                  void ensureCitationUrl(s.source_document_name);
                openCitation({
                  key,
                  documentName: s.source_document_name,
                  pageNumber: s.page_number,
                  quoteHe: s.verbatim_quote,
                  boundingBoxes: s.bounding_boxes,
                  sourceIndex: i,
                  citationSection,
                });
              }}
              title={`${s.source_document_name} • עמ' ${s.page_number}`}
            >
              {label}
            </button>
          );
        })}
      </>
    );
  }

  function FindingsGroup({
    items,
    title,
  }: {
    /** Each item carries the finding and its index in report.findings (for citation API). */
    items: Array<{ finding: Finding; findingIndex: number }>;
    title?: string;
  }) {
    if (!items.length) return null;
    return (
      <div className="space-y-3">
        {title && <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400">{title}</h4>}
        {items.map(({ finding: f, findingIndex }, idx) => (
          <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2 mb-2">
              <SeverityIcon severity={f.severity} />
              <span className="font-bold">{f.title}</span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {f.description}
              <CitationKeysInline
                sources={f.sources}
                findingIndex={findingIndex}
              />
            </p>
          </div>
        ))}
      </div>
    );
  }

  const renderFinanceReport = (report: RealEstateFinanceDDReport) => {
    const rawSigning = report.signing_percentage ?? 0;
    const signingPct = Math.min(
      100,
      rawSigning <= 1 ? Math.round(rawSigning * 100) : Math.round(rawSigning),
    );
    const signedCount = (report.tenant_table ?? []).filter(
      (t) => t.is_signed,
    ).length;
    const totalTenants = (report.tenant_table ?? []).length;
    const warningNoteCount = (report.tenant_table ?? []).filter(
      (t) => t.is_warning_note_registered,
    ).length;
    const warningNotePct = totalTenants
      ? Math.round((warningNoteCount / totalTenants) * 100)
      : 0;

    const riskLevel: RiskLevel =
      report.executive_summary?.risk_level ??
      (report.high_risk_flags?.length ? "high" : "low");

    const cd = report.compound_details;
    const ds = report.developer_signature;
    const poa = report.power_of_attorney;
    const fin = report.financing;
    const zr = report.zero_report_metrics;

    const findingsByCategory = (cats: string[]) =>
      (report.findings ?? [])
        .map((f, i) => ({ finding: f, findingIndex: i }))
        .filter((x) => cats.includes(x.finding.category));

    const guaranteeFindings = findingsByCategory(["financial"]);
    const legalFindings = findingsByCategory(["legal"]);
    const corporateFindings = findingsByCategory(["corporate"]);
    const addendumFindings = findingsByCategory(["addendum"]);

    return (
      <div className="w-full space-y-6">
        {/* ─── 1. Executive Summary ───────────────────────────────── */}
        <Card className="rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2 shrink-0">
                  <Sparkles className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                </div>
                <div className="min-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help inline-block">
                        <CardTitle className="text-xl font-bold text-slate-800 dark:text-slate-100">
                          תקציר מנהלים
                        </CardTitle>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[280px]">
                      סיכום בדיקת הנאותות ורמת סיכון
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <Badge
                className={cn(
                  "shrink-0 rounded-full px-3 py-0.5 text-[11px] font-medium",
                  riskLevel === "high"
                    ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200/60 dark:border-red-800/60"
                    : riskLevel === "medium"
                      ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60"
                      : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60",
                )}
              >
                {RISK_LABELS[riskLevel]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-0">
            <p className="text-sm leading-[1.65] text-slate-700 dark:text-slate-300 text-right w-full m-0">
              {report.executive_summary?.summary}
            </p>
          </CardContent>
        </Card>

        {/* ─── Timeline ───────────────────────────────────────────── */}
        {timelineEvents.length > 0 && (
          <ProjectTimeline events={timelineEvents} />
        )}

        {/* ─── 2. Compound Details (פרטי המתחם) ──────────────────── */}
        {cd && (
          <ReportSection
            icon={<Building2 className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title="פרטי המתחם"
            tooltip="זיהוי ותיאור המקרקעין, תוך ביצוע הצלבה והשוואה בין מסמכי המקור השונים"
          >
            <div className="space-y-5">
              {/* Bubbles row */}
              <div className="flex flex-wrap gap-3">
                {cd.address && (
                  <StatBubble label="כתובת" value={cd.address} />
                )}
                {(cd.gush || cd.helka) && (
                  <StatBubble
                    label="גוש / חלקה"
                    value={`${cd.gush ?? "—"} / ${cd.helka ?? "—"}`}
                  />
                )}
                {cd.incoming_state && (
                  <StatBubble
                    label="מצב נכנס"
                    value={
                      <>
                        {cd.incoming_state.building_count ?? "—"}{" "}
                        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                          בניינים
                        </span>{" "}
                        • {cd.incoming_state.apartment_count ?? "—"}{" "}
                        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                          דירות
                        </span>
                      </>
                    }
                  />
                )}
                {cd.outgoing_state && (
                  <StatBubble
                    label="מצב יוצא"
                    value={
                      <>
                        {cd.outgoing_state.building_count ?? "—"}{" "}
                        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                          בניינים
                        </span>{" "}
                        • {cd.outgoing_state.apartment_count ?? "—"}{" "}
                        <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                          דירות
                        </span>
                      </>
                    }
                  />
                )}
              </div>
              {cd.discrepancy_note && (
                <div
                  className={cn(
                    "rounded-xl p-3 text-sm",
                    cd.discrepancy_note.includes("אין פער")
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                      : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300",
                  )}
                >
                  {cd.discrepancy_note}
                </div>
              )}
            </div>
          </ReportSection>
        )}

        {/* ─── 3. Tenant Table (טבלת דיירים) ─────────────────────── */}
        {totalTenants > 0 && (
          <ReportSection
            icon={<Users className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title="טבלת דיירים"
            tooltip="ריכוז בעלי הזכויות לפי נסח הטאבו, פירוט הערות אזהרה/מניעה ובדיקת סטטוס החתימות על הסכם הפרויקט"
          >
            <div className="space-y-5">
              {/* Stats: same bubble style as zero report */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <StatBubble
                    label="אחוז חתימות על ההסכם"
                    value={`${signingPct}%`}
                    sub={`${signedCount} מתוך ${totalTenants}`}
                  />
                  <SectionCitationKeys
                    sources={report.tenant_table_signing_sources}
                    citationSection="tenant_signing"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <StatBubble
                    label="אחוז הערות אזהרה ליזם"
                    value={`${warningNotePct}%`}
                    sub={`${warningNoteCount} מתוך ${totalTenants}`}
                  />
                  <SectionCitationKeys
                    sources={report.tenant_table_warning_note_sources}
                    citationSection="tenant_warning_note"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>חלקה</TableHead>
                      <TableHead>תת חלקה</TableHead>
                      <TableHead>שם בעלים</TableHead>
                      <TableHead>חתימה</TableHead>
                      <TableHead>מועד חתימה</TableHead>
                      <TableHead>הערת אזהרה ליזם</TableHead>
                      <TableHead>הערה מגבילה</TableHead>
                      <TableHead>משכנתא</TableHead>
                      <TableHead className="min-w-[200px]">הערות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.tenant_table.map((t, i) => (
                      <TableRow key={i}>
                        <TableCell>{t.helka ?? "—"}</TableCell>
                        <TableCell>{t.sub_parcel ?? "—"}</TableCell>
                        <TableCell className="font-medium">
                          {t.owner_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={t.is_signed ? "default" : "outline"}
                            className={cn(
                              "rounded-full text-xs",
                              t.is_signed
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
                            )}
                          >
                            {yn(t.is_signed)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">
                          {t.date_signed ?? "—"}
                        </TableCell>
                        <TableCell>
                          {yn(t.is_warning_note_registered)}
                        </TableCell>
                        <TableCell>
                          {yn(t.restrictive_note_registered)}
                        </TableCell>
                        <TableCell>{yn(t.is_mortgage_registered)}</TableCell>
                        <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                          {t.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </ReportSection>
        )}

        {/* ─── 4. Developer Signature (חתימת היזם) ────────────────── */}
        {ds && (
          <ReportSection
            icon={<Gavel className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title="חתימת היזם"
            tooltip="התקשרות וייצוג משפטי — פרטי הגורמים המייצגים, מועד חתימת היזם וזיהוי מורשי החתימה בפרויקט"
          >
            <div className="space-y-0">
              <InfoRow
                label="מועד חתימת היזם"
                value={ds.developer_signed_date}
              />
              <InfoRow
                label="מורשה חתימה"
                value={ds.authorized_signatory_name}
              />
              <InfoRow
                label="ת.ז. מורשה חתימה"
                value={ds.authorized_signatory_id}
              />
              <InfoRow
                label="פרוטוקול מסמיך"
                value={
                  ds.signing_protocol_authorized === null
                    ? "לא סופק"
                    : ds.signing_protocol_authorized
                      ? "תואם — מאושר"
                      : "אי-התאמה — נדרש בירור"
                }
              />
            </div>
          </ReportSection>
        )}

        {/* ─── 5. Agreement Addenda (תוספות להסכם) ────────────────── */}
        {addendumFindings.length > 0 && (
          <ReportSection
            icon={<FileText className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title="תוספות להסכם"
            tooltip="ממצאים הנוגעים לתוספות ומכתבי הטבה — בדיקת תיאום מול דו״ח האפס"
          >
            <FindingsGroup items={addendumFindings} />
          </ReportSection>
        )}

        {/* ─── 6. Legal Representation (באי כוח) ───────────────────── */}
        {poa && (
          <ReportSection
            icon={<Scale className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title="באי כוח"
            tooltip="התקשרות וייצוג משפטי — פרטי הגורמים המייצגים, מועד חתימת היזם וזיהוי מורשי החתימה בפרויקט"
          >
            <div className="space-y-0">
              <InfoRow label="בא כוח היזם" value={poa.developer_attorney} />
              <InfoRow label="בא כוח הבעלים" value={poa.owners_attorney} />
            </div>
          </ReportSection>
        )}

        {/* ─── 7. Financing Body (הגוף המממן) ─────────────────────── */}
        {fin && (
          <ReportSection
            icon={<Landmark className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title="הגוף המממן"
            tooltip="בחינת הגוף המממן — סקירה וניתוח אופי הגוף המלווה (בנקאי/חוץ-בנקאי)"
          >
            <div className="space-y-0">
              {fin.lender_definition_clause != null &&
              fin.lender_definition_clause !== "" ? (
                <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-700">
                  <div className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">
                    הגדרת הבנק המלווה בהסכם
                  </div>
                  <div className="text-sm text-slate-900 dark:text-slate-100 flex-1 text-start whitespace-pre-wrap wrap-break-word min-w-0">
                    {fin.lender_definition_clause}
                  </div>
                </div>
              ) : null}
              <InfoRow label="הגוף המממן בפועל" value={fin.actual_lender} />
              {fin.lender_compliance_note && (
                <div
                  className={cn(
                    "rounded-xl p-3 text-sm mt-3",
                    fin.lender_compliance_note.includes("תואם")
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                      : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300",
                  )}
                >
                  {fin.lender_compliance_note}
                </div>
              )}
              <InfoRow
                label="הלוואת מזנין"
                value={
                  fin.mezzanine_loan_exists === null
                    ? null
                    : fin.mezzanine_loan_exists
                      ? (fin.mezzanine_loan_details ?? "קיימת")
                      : "לא קיימת"
                }
              />
            </div>
          </ReportSection>
        )}

        {/* ─── 8. Guarantees (ערבויות) — table format ──── */}
        {guaranteeFindings.length > 0 && (
          <ReportSection
            icon={<Shield className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title="ערבויות וביטחונות"
            tooltip="ערבויות — פירוט סוגי הערבויות בהסכם הפרויקט"
          >
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                פירוט ערבויות — הסכם הפרויקט
              </p>
              <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                      <TableHead className="py-2.5 px-4 text-right font-semibold text-slate-600 dark:text-slate-300 w-[28%]">
                        ערבות
                      </TableHead>
                      <TableHead className="py-2.5 px-4 text-right font-semibold text-slate-600 dark:text-slate-300 min-w-[280px]">
                        הערות
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guaranteeFindings.map(({ finding: f, findingIndex }, i) => {
                      const noteMatch = f.description.match(/הערה[:\s]*([^.]+)/i) ?? f.description.match(/ערבויות לא מוזכרות[^.]*\.?/);
                      const notes = noteMatch ? (typeof noteMatch[1] === "string" ? noteMatch[1].trim() : noteMatch[0]) : f.description;
                      return (
                        <TableRow
                          key={i}
                          className={i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/60 dark:bg-slate-800/60"}
                        >
                          <TableCell className="py-2.5 px-4 font-medium text-slate-700 dark:text-slate-200 text-right border-b border-slate-100 dark:border-slate-700">
                            {f.title}
                          </TableCell>
                          <TableCell className="py-2.5 px-4 text-slate-600 dark:text-slate-300 text-right border-b border-slate-100 dark:border-slate-700 min-w-[280px]">
                            <span className="inline-flex items-start gap-1">
                              {notes}
                              <CitationKeysInline
                                sources={f.sources}
                                findingIndex={findingIndex}
                              />
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </table>
              </div>
            </div>
          </ReportSection>
        )}

        {/* ─── 9. Upgrade / Downgrade (שדרוג ושנמוך) ──────────── */}
        {(() => {
          const ud = (report as RealEstateFinanceDDReport)
            .upgrade_downgrade as UpgradeDowngradeInfo | null | undefined;
          if (!ud) return null;
          const boolLabel = (v: boolean | null | undefined) =>
            v == null ? "לא מוזכר בהסכם" : v ? "כן" : "לא";
          return (
            <ReportSection
              icon={<ArrowUpDown className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
              title="שדרוג ושנמוך דירת התמורה"
              tooltip="זכאות הדיירים לשדרג או להוריד את מפרט דירת התמורה שלהם לפי ההסכם"
            >
              <div className="space-y-0">
                <InfoRow label="שדרוג דירה" value={boolLabel(ud.upgrade_allowed)} />
                {ud.upgrade_details && (
                  <InfoRow label="תנאי שדרוג" value={ud.upgrade_details} />
                )}
                <InfoRow label="שנמוך דירה" value={boolLabel(ud.downgrade_allowed)} />
                {ud.downgrade_details && (
                  <InfoRow label="תנאי שנמוך" value={ud.downgrade_details} />
                )}
                {ud.upgrade_allowed == null && ud.downgrade_allowed == null && !ud.upgrade_details && !ud.downgrade_details && (
                  <InfoRow label="סטטוס" value="אין התייחסות בהסכם" />
                )}
              </div>
            </ReportSection>
          );
        })()}

        {/* ─── 10. Timelines (לוחות זמנים) ───────────────────────── */}
        {(((report as RealEstateFinanceDDReport).contractual_milestones?.length ?? 0) > 0 ||
          legalFindings.length > 0) && (
          <ReportSection
            icon={<FileText className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title="לוחות זמנים וסטטוס תכנוני"
            tooltip={
              'ניתוח צפי הביצוע והשוואת אבני הדרך בין התחייבויות ההסכם לתחזית בדו"ח האפס'
            }
          >
            <div className="space-y-4">
              {/* Contractual milestones table */}
              {((report as RealEstateFinanceDDReport).contractual_milestones?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                    לוח זמנים חוזי — הסכם הפרויקט
                  </p>
                  <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {(report as RealEstateFinanceDDReport).contractual_milestones!.map(
                          (m: ContractualMilestone, i: number) => (
                            <tr
                              key={i}
                              className={
                                i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/60 dark:bg-slate-800/60"
                              }
                            >
                              <td className="py-2.5 px-4 font-medium text-slate-700 dark:text-slate-200 text-right w-2/5 border-b border-slate-100 dark:border-slate-700">
                                {m.milestone}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 text-right border-b border-slate-100 dark:border-slate-700">
                                {m.deadline_or_condition}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* Gap findings */}
              {legalFindings.length > 0 && (
                <FindingsGroup items={legalFindings} />
              )}
            </div>
          </ReportSection>
        )}

        {/* ─── 11. Corporate Governance (ממשל תאגידי) ─────────────── */}
        {(report.developer_ubo_chain?.length > 0 ||
          ((report as RealEstateFinanceDDReport).developer_ubo_graph?.nodes
            ?.length ?? 0) > 0 ||
          corporateFindings.length > 0) && (
          <ReportSection
            icon={<Users className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title="ממשל תאגידי ושעבודים"
            tooltip="סקירת מבנה הבעלות (שרשרת אחזקות) ובדיקת שעבודים קיימים על החברות ובעלי השליטה"
          >
            <div className="space-y-4">
              {(() => {
                const uboGraph = (report as RealEstateFinanceDDReport)
                  .developer_ubo_graph;
                if (uboGraph?.nodes && uboGraph.nodes.length > 0) {
                  return (
                    <div>
                      <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">
                        מבנה אחזקות ובעלי מניות
                      </h4>
                      <UboGraphView graph={uboGraph} />
                    </div>
                  );
                }
                if (report.developer_ubo_chain?.length > 0) {
                  return (
                    <div>
                      <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">
                        מבנה אחזקות ובעלי מניות
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {report.developer_ubo_chain.map((entity, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="rounded-full text-xs"
                          >
                            {i > 0 && (
                              <span className="text-slate-300 dark:text-slate-500 mx-1">←</span>
                            )}
                            {entity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              <FindingsGroup items={corporateFindings} />
            </div>
          </ReportSection>
        )}

        {/* ─── 12. Zero Report (דו"ח אפס) ─────────────────────────── */}
        {zr && (
          <ReportSection
            icon={<TrendingUp className="h-5 w-5 text-slate-700 dark:text-slate-300" />}
            title='דו"ח אפס'
            tooltip={
              'דו"ח אפס — ניתוח כלכלי ותכנוני הכולל בדיקת מגבלות תכנון, אומדן עלויות ושקלול רווחיות הפרויקט'
            }
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {zr.profit_on_turnover !== null &&
                  zr.profit_on_turnover !== undefined && (
                    <StatBubble
                      label="רווח למחזור"
                      value={`${(zr.profit_on_turnover * 100).toFixed(1)}%`}
                    />
                  )}
                {zr.profit_on_cost !== null &&
                  zr.profit_on_cost !== undefined && (
                    <StatBubble
                      label="רווח לעלות"
                      value={`${(zr.profit_on_cost * 100).toFixed(1)}%`}
                    />
                  )}
              </div>
              <InfoRow label="נמען הדו״ח" value={zr.addressee} />
              {zr.construction_restrictions?.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">
                    מגבלות בניה
                  </h4>
                  <ul className="text-sm text-slate-800 dark:text-slate-200 space-y-1 list-disc list-inside">
                    {zr.construction_restrictions.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <InfoRow label="הצמדה למדד" value={zr.indexation_details} />
            </div>
          </ReportSection>
        )}

      </div>
    );
  };

  const renderContent = () => {
    if (isFinanceReport(report)) {
      return renderFinanceReport(report);
    }

    if (isStandardDDReport(report)) {
      return (
        <div className="w-full space-y-6">
          <Card className="rounded-3xl border-none bg-white dark:bg-slate-900 shadow-sm p-6">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help inline-block">
                  <h2 className="text-xl font-bold mb-4">תקציר בדיקת נאותות</h2>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[280px]">
                סיכום כללי של ממצאי בדיקת הנאותות
              </TooltipContent>
            </Tooltip>
            <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
              {report.executive_summary?.summary}
            </p>
          </Card>

          <div className="grid gap-4">
            {report.findings.map((f, i) => (
              <Card key={i} className="rounded-2xl border-none shadow-sm p-4">
                <div className="flex items-center justify-end gap-2 mb-2">
                  <h4 className="font-bold">{f.title}</h4>
                  <SeverityIcon severity={f.severity} />
                </div>
                <p className="text-sm">
                  {f.description}
                  <CitationKeysInline sources={f.sources} findingIndex={i} />
                </p>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <TooltipProvider>
      <div className="w-full space-y-6">
        <Sheet open={citationOpen} onOpenChange={setCitationOpen}>
          <SheetContent
            side="left"
            className="flex w-full max-w-[95vw] sm:max-w-4xl flex-col p-0 gap-0 border-r bg-slate-50 dark:bg-slate-900"
          >
            <SheetHeader className="p-4 shrink-0 border-b bg-white dark:bg-slate-900">
              <div className="flex flex-col gap-2">
                <SheetTitle className="text-base font-bold text-right">
                  {citationKey ? `${citationKey} • ` : ""}
                  {citationTitle}
                  {citationPage ? ` • עמ' ${citationPage}` : ""}
                </SheetTitle>
                {citationUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit self-end"
                    onClick={() =>
                      window.open(citationUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    פתח את המסמך המלא
                  </Button>
                ) : null}
              </div>
            </SheetHeader>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {citationQuote ? (
                <div className="shrink-0 w-full border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-950 dark:text-amber-200">
                  <div className="text-[11px] font-bold text-amber-700 mb-1 uppercase tracking-wider">
                    ציטוט מהמסמך
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {citationQuote}
                  </div>
                </div>
              ) : null}
              <div className="flex-1 min-h-0 overflow-y-auto flex justify-center p-3">
                {citationLoading ? (
                  <div className="flex h-64 items-center justify-center text-slate-500 dark:text-slate-400">
                    טוען...
                  </div>
                ) : citationUrl && citationPage ? (
                  <div className="w-full">
                    <PdfCitationViewer
                      url={citationUrl}
                      pageNumber={citationPage}
                      boundingBoxes={citationBoundingBoxes}
                      maxWidth={720}
                      heightClassName="min-h-0"
                      allPages
                      scrollToPage={citationPage}
                    />
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    שגיאה בטעינת המסמך
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex justify-start flex-wrap items-center gap-3">
          {projectId && checkId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void exportReportToPdf()}
              disabled={exportingPdf}
              className="gap-2"
            >
              <FileDown className="h-4 w-4 shrink-0" />
              {exportingPdf ? "מייצא..." : "ייצוא ל-PDF"}
            </Button>
          )}
          {projectId && checkId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void exportReportToWord()}
              disabled={exportingWord}
              className="gap-2"
            >
              <FileText className="h-4 w-4 shrink-0" />
              {exportingWord ? "מייצא..." : "ייצוא ל-Word"}
            </Button>
          )}
        </div>
        <div className="report-pdf-source">
          {renderContent()}
        </div>
      </div>
    </TooltipProvider>
  );
}
