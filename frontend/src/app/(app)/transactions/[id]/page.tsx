"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileDown,
  FileText,
  FolderOpen,
  Loader2,
  MoreVertical,
  Play,
  RotateCcw,
  ShieldAlert,
  Trash2,
  User,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import type {
  DDReportResponse,
  DocumentType,
  Project,
  ProjectMember,
  QASummary,
} from "@/lib/types";
import { getProjectDealType } from "@/lib/deal-type-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisStatus } from "@/components/analysis-status";
import { TenantTableReview } from "@/components/tenant-table-review";
import { ReportViewer } from "@/components/report-viewer";
import { AgentSessionViewer } from "@/components/agent-session-viewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DOC_TYPE_LABELS } from "@/lib/constants";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין",
  processing: "בתהליך",
  completed: "הושלם",
  failed: "נכשל",
  partial: "חלקי",
  needs_review: "דורש בדיקה",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  processing: "secondary",
  completed: "default",
  failed: "destructive",
  partial: "secondary",
  needs_review: "destructive",
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Parse "פרטי פרויקט" block from project description into key-value pairs. */
function parseProjectDetailsFromDescription(
  description: string | null | undefined,
): Array<{ label: string; value: string }> {
  if (!description?.trim()) return [];
  const lines = description.split(/\r?\n/);
  const pairs: Array<{ label: string; value: string }> = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "פרטי פרויקט" || trimmed === "---") {
      inBlock = trimmed === "פרטי פרויקט" || inBlock;
      continue;
    }
    if (inBlock || pairs.length === 0) {
      const match = trimmed.match(/^[-–—]\s*(.+?):\s*(.*)$/);
      if (match) {
        pairs.push({ label: match[1].trim(), value: match[2].trim() });
        inBlock = true;
      } else if (trimmed.startsWith("- ") && trimmed.includes(":")) {
        const idx = trimmed.indexOf(":", 2);
        if (idx > 0) {
          pairs.push({
            label: trimmed.slice(2, idx).trim(),
            value: trimmed.slice(idx + 1).trim(),
          });
          inBlock = true;
        }
      }
    }
  }
  if (pairs.length > 0) return pairs;
  // Fallback: single line with " - " separators (e.g. "--- פרטי פרויקט - שם הלקוח: X - ...")
  const parts = description.split(/\s+-\s+/).filter(Boolean);
  for (const part of parts) {
    const colon = part.indexOf(":");
    if (colon > 0) {
      const label = part
        .slice(0, colon)
        .replace(/^[-–—]\s*/, "")
        .trim();
      const value = part.slice(colon + 1).trim();
      if (label && !label.includes("פרטי פרויקט")) {
        pairs.push({ label, value });
      }
    }
  }
  return pairs;
}

function QAReviewBanner({
  qaSummary,
  qaAttempts = 1,
  reportReviewNotes,
}: {
  qaSummary: QASummary | null;
  qaAttempts?: number;
  reportReviewNotes?: string[];
}) {
  const scores = qaSummary?.scores ?? [];
  const corrections = qaSummary?.corrections_he ?? reportReviewNotes ?? [];
  const passed = scores.filter((s) => s.passed).length;
  const failed = scores.filter((s) => !s.passed).length;

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-orange-200 bg-orange-50 shadow-sm">
        <CardContent className="flex items-start gap-4 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100">
            <ShieldAlert className="h-5 w-5 text-orange-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-orange-900">
              הדוח דורש בדיקת עורך דין
            </h3>
            <p className="mt-1 text-sm text-orange-800">
              {qaAttempts > 1
                ? `שופט ה-QA זיהה ממצאים שלא תוקנו גם לאחר ${qaAttempts} סבבי תיקון אוטומטי. `
                : "שופט ה-QA זיהה ממצאים שאינם עומדים בסף המשפטי הנדרש. "}
              יש לבדוק את ההערות לפני מסירת הדוח ללקוח.
            </p>
            {scores.length > 0 && (
              <div className="mt-3 flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {passed} עברו
                </span>
                <span className="flex items-center gap-1 text-red-700">
                  <XCircle className="h-4 w-4" />
                  {failed} נכשלו
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {corrections.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              הערות לתיקון ({corrections.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {corrections.map((note, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-xl border border-orange-100 bg-orange-50/50 p-3 text-sm text-slate-800"
                >
                  <span className="mt-0.5 shrink-0 text-orange-500 font-bold">
                    {i + 1}.
                  </span>
                  {note}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {scores.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ציוני ביקורת QA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {scores.map((s) => (
                <div
                  key={s.criterion_id}
                  className="flex items-start gap-3 py-3"
                >
                  <div className="mt-0.5">
                    {s.passed ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900 text-sm">
                        {s.criterion_name}
                      </span>
                      <Badge
                        variant={s.passed ? "default" : "destructive"}
                        className="shrink-0 rounded-full text-[10px]"
                      >
                        {Math.round(s.confidence * 100)}%
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{s.reasoning}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function TransactionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [reportData, setReportData] = useState<DDReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [qaSummary, setQaSummary] = useState<QASummary | null>(null);
  const [qaAttempts, setQaAttempts] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<string>("details");
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  // True after user approves HITL review — hides the sheet and resumes animation
  const [hitlApproved, setHitlApproved] = useState(false);
  const userChangedTabRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autostartFiredRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const p = await api.getProject(id);
      setProject(p);

      const terminal = ["completed", "partial", "needs_review", "failed"];
      if (terminal.includes(p.status)) {
        if (p.status !== "failed") {
          try {
            const r = await api.getResults(id);
            setReportData(r);
            if (
              r.report &&
              typeof r.report === "object" &&
              "qa_attempt" in r.report
            ) {
              const stored = (r.report as Record<string, unknown>).qa_attempt;
              if (typeof stored === "number") setQaAttempts(stored);
            }
          } catch {
            // Results may not be available yet
          }
        }
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      // handle error silently
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();

    const intervalMs =
      project?.status === "processing" || analyzing ? 2000 : 5000;
    pollRef.current = setInterval(async () => {
      try {
        const p = await api.getProject(id);
        setProject(p);
        const terminal = ["completed", "partial", "failed"].includes(p.status);
        const hitlWaiting =
          p.status === "needs_review" &&
          p.pipeline_stage === "hitl_tenant_review";
        if (terminal || hitlWaiting) {
          setAnalyzing(false);
          fetchData();
          if (p.status === "completed" || p.status === "partial") {
            const { addNotification } = await import("@/lib/notifications");
            addNotification(p.id, p.title, "בדיקת הנאותות הושלמה בהצלחה");
          }
        }
      } catch {
        // ignore polling errors
      }
    }, intervalMs);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, fetchData, project?.status, analyzing]);

  // Open report/documents tab when URL has ?tab=report or ?tab=documents (e.g. from new-transaction success)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "report" || t === "documents") setActiveTab(t);
  }, [searchParams]);

  // Fetch project members when viewing the details tab
  useEffect(() => {
    if (!project || activeTab !== "details") return;
    let cancelled = false;
    setMembersLoading(true);
    api
      .getProjectMembers(project.id)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, activeTab]);

  useEffect(() => {
    if (!project || loading) return;
    if (userChangedTabRef.current) return;
    const shouldShowReport =
      ["completed", "partial", "needs_review"].includes(project.status) ||
      project.status === "processing";
    if (shouldShowReport) setActiveTab("report");
  }, [project, loading]);

  // Reset hitlApproved once the pipeline moves past HITL (or project completes)
  useEffect(() => {
    if (project?.pipeline_stage !== "hitl_tenant_review") {
      setHitlApproved(false);
    }
  }, [project?.pipeline_stage]);

  // Warn before leaving the page while HITL review is pending
  useEffect(() => {
    const isHitlActive =
      !hitlApproved &&
      project?.status === "needs_review" &&
      project?.pipeline_stage === "hitl_tenant_review";

    if (!isHitlActive) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hitlApproved, project?.status, project?.pipeline_stage]);

  useEffect(() => {
    if (autostartFiredRef.current) return;
    if (!project || loading) return;
    if (searchParams.get("autostart") !== "1") return;
    if (project.status === "processing" || analyzing) return;

    const uploaded = project.files.filter(
      (f) => f.upload_status === "uploaded",
    );
    if (uploaded.length === 0) return;

    autostartFiredRef.current = true;
    router.replace(`/transactions/${id}`, { scroll: false });

    const dealMeta = getProjectDealType(project.id);
    const isFinance =
      dealMeta?.dealType === "real_estate" &&
      dealMeta?.realEstateType === "project_finance";

    if (isFinance) {
      handleAnalyzeFinance();
    } else {
      handleAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, loading]);

  async function handleAnalyze() {
    if (!project) return;
    setAnalyzing(true);
    setReportData(null);
    setQaSummary(null);
    setQaAttempts(1);
    setActiveTab("report");

    try {
      const dealType = getProjectDealType(project.id);
      const result = await api.analyzeProjectWithOptions(project.id, {
        deal_type: dealType?.dealType,
        real_estate_type: dealType?.realEstateType ?? undefined,
      });

      if (result.qa_summary) setQaSummary(result.qa_summary);
      if (result.qa_attempts) setQaAttempts(result.qa_attempts);

      await fetchData();

      if (result.status === "completed") {
        toast.success("ניתוח הנאותות הושלם!");
      } else if (result.status === "needs_review") {
        toast.info("נדרשת סקירה לפני המשך הניתוח", {
          description: "בדוק את טבלת החתימות ואשר כדי להמשיך.",
        });
      } else if (result.status === "failed") {
        toast.error("הניתוח נכשל", {
          description: "צוותנו קיבל הודעה ונטפל בהקדם.",
        });
      }
    } catch {
      toast.error("הניתוח נכשל", {
        description: "צוותנו קיבל הודעה ונטפל בהקדם.",
      });
      await fetchData();
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAnalyzeFinance() {
    if (!project) return;
    setAnalyzing(true);
    setReportData(null);
    setQaSummary(null);
    setQaAttempts(1);
    setActiveTab("report");

    try {
      const result = await api.analyzeProjectWithOptions(project.id, {
        deal_type: "real_estate",
        real_estate_type: "project_finance",
      });

      if (result.qa_summary) setQaSummary(result.qa_summary);
      if (result.qa_attempts) setQaAttempts(result.qa_attempts);

      await fetchData();

      if (result.status === "completed") {
        toast.success(
          result.qa_attempts && result.qa_attempts > 1
            ? `ניתוח הנאותות הושלם! (תוקן אוטומטית ב-${result.qa_attempts} סבבים)`
            : "ניתוח הנאותות הושלם!",
        );
      } else if (result.status === "needs_review") {
        toast.info("נדרשת סקירה לפני המשך הניתוח", {
          description: "בדוק את טבלת החתימות ואשר כדי להמשיך.",
        });
      } else if (result.status === "failed") {
        toast.error("הניתוח נכשל", {
          description: "צוותנו קיבל הודעה ונטפל בהקדם.",
        });
      }
    } catch {
      toast.error("הניתוח נכשל", {
        description: "צוותנו קיבל הודעה ונטפל בהקדם.",
      });
      await fetchData();
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <div className="py-16 text-center">
          <h2 className="text-xl font-semibold">פרוייקט לא נמצא</h2>
          <Button className="mt-4" onClick={() => router.push("/dashboard")}>
            חזור ללוח בקרה
          </Button>
        </div>
      </>
    );
  }

  const uploadedFiles = project.files.filter(
    (f) => f.upload_status === "uploaded",
  );
  const hasUploads = uploadedFiles.length > 0;
  const canAnalyze =
    hasUploads && project.status !== "processing" && !analyzing;
  const dealMeta = getProjectDealType(project.id);
  const isFinanceProject =
    dealMeta?.dealType === "real_estate" &&
    dealMeta?.realEstateType === "project_finance";
  const report = reportData?.report ?? null;

  // Use check_id from results, or fall back to the latest dd_check on the project.
  const latestCheckId =
    reportData?.check_id ??
    (project.dd_checks?.length
      ? project.dd_checks[project.dd_checks.length - 1].id
      : null);

  // True while HITL review is needed and the user hasn't yet approved
  const isHitlPending =
    !hitlApproved &&
    project.status === "needs_review" &&
    project.pipeline_stage === "hitl_tenant_review" &&
    !!latestCheckId;

  return (
    <>
      <div className="space-y-6">
        {/* ══════════════════════════════════════════════════════════
            Bubble 1 — Project Header
        ══════════════════════════════════════════════════════════ */}
        <Card className="rounded-2xl border-none bg-white shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center gap-3 px-5 py-4">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-xl text-slate-400 hover:text-slate-700"
                onClick={() => {
                  if (isHitlPending) {
                    toast.warning("יש לאשר את טבלת החתימות לפני עזיבת הדף");
                    return;
                  }
                  router.push("/transactions");
                }}
                aria-label="חזרה לפרויקטים"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>

              <div className="h-8 w-px bg-slate-100" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold text-slate-900">
                    {project.title}
                  </h1>
                  <Badge
                    variant={STATUS_VARIANT[project.status] ?? "outline"}
                    className="shrink-0 rounded-full"
                  >
                    {STATUS_LABELS[project.status] ?? project.status}
                  </Badge>
                </div>
              </div>

              {canAnalyze && !isFinanceProject && (
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="shrink-0 rounded-xl"
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : project.status === "failed" ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {project.status === "completed" ? "הרץ מחדש" : "הרץ בדיקה"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════
            Bubble 2 — Tabs: Documents | Project Details | DD Report
        ══════════════════════════════════════════════════════════ */}
        <Card className="rounded-2xl border-none bg-white shadow-sm overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              if (isHitlPending) {
                toast.warning("יש לאשר את טבלת החתימות לפני מעבר לשלב הבא");
                return;
              }
              userChangedTabRef.current = true;
              setActiveTab(v);
            }}
            dir="rtl"
          >
            <div className="border-b border-slate-100 px-5">
              <TabsList className="h-auto bg-transparent gap-1 p-0">
                <TabsTrigger
                  value="details"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm"
                >
                  <Users className="h-4 w-4 ml-2" />
                  פרטי הפרויקט
                </TabsTrigger>
                <TabsTrigger
                  value="documents"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm"
                >
                  <FolderOpen className="h-4 w-4 ml-2" />
                  מסמכים
                </TabsTrigger>
                <TabsTrigger
                  value="report"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm"
                >
                  <FileText className="h-4 w-4 ml-2" />
                  דוח DD מלא
                </TabsTrigger>
                {reportData?.check_id &&
                  ["completed", "partial", "needs_review", "failed"].includes(
                    project.status,
                  ) && (
                    <TabsTrigger
                      value="ai-log"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm"
                    >
                      <BrainCircuit className="h-4 w-4 ml-2" />
                      יומן AI
                    </TabsTrigger>
                  )}
              </TabsList>
            </div>

            {/* ─── Tab: Documents ──────────────────────────────── */}
            <TabsContent value="documents" className="p-5 space-y-4 m-0">
              <div className="flex flex-wrap items-center gap-5 text-sm text-slate-500 pb-2">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  <span>{uploadedFiles.length} מסמכים</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  <span>
                    נוצר ב־
                    {new Date(project.created_at).toLocaleDateString("he-IL", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
              {project.files.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  עדיין לא הועלו מסמכים לפרויקט
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>מסמך</TableHead>
                      <TableHead>גודל</TableHead>
                      <TableHead>תאריך</TableHead>
                      <TableHead>סטטוס</TableHead>
                      <TableHead>פעולות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.files.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                              <FileDown className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900">
                                {f.original_name}
                              </div>
                              <div className="text-xs text-slate-400">
                                {DOC_TYPE_LABELS[f.doc_type as DocumentType] ??
                                  f.doc_type}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {formatBytes(f.file_size_bytes)}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {new Date(f.created_at).toLocaleDateString("he-IL")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={[
                              "rounded-full",
                              f.upload_status === "uploaded"
                                ? "bg-emerald-600 hover:bg-emerald-600"
                                : f.upload_status === "failed"
                                  ? "bg-red-600 hover:bg-red-600"
                                  : "bg-slate-600 hover:bg-slate-600",
                            ].join(" ")}
                          >
                            {f.upload_status === "uploaded"
                              ? "מלא"
                              : f.upload_status === "failed"
                                ? "נכשל"
                                : "ממתין"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-xl"
                              onClick={() =>
                                toast.message("הורדה", {
                                  description: "בקרוב: הורדת מסמך",
                                })
                              }
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-xl text-destructive hover:text-destructive"
                              onClick={() =>
                                toast.message("מחיקה", {
                                  description: "בקרוב: מחיקת מסמך",
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-xl"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* ─── Tab: Project Details ────────────────────────── */}
            <TabsContent value="details" className="p-5 m-0">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-5 text-sm text-slate-500 pb-2">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    <span>{uploadedFiles.length} מסמכים</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    <span>
                      תאריך פתיחה:{" "}
                      {new Date(project.created_at).toLocaleDateString(
                        "he-IL",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                    </span>
                  </div>
                </div>

                {(() => {
                  const detailRows = parseProjectDetailsFromDescription(
                    project.description,
                  );
                  return detailRows.length > 0 ? (
                    <div className="rounded-2xl border border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                        <FileText className="h-4 w-4" />
                        פרטי פרויקט
                      </div>
                      <dl className="space-y-2 text-sm">
                        {detailRows.map((row, i) => (
                          <div
                            key={i}
                            className="flex flex-wrap justify-between gap-2 py-2 border-b border-slate-50 dark:border-slate-700 last:border-b-0"
                          >
                            <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
                            <dd className="font-medium text-slate-900 dark:text-slate-100 text-left">
                              {row.value || "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null;
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                      <User className="h-4 w-4" />
                      יוצר הפרויקט
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {membersLoading
                        ? "טוען..."
                        : (() => {
                            const owner = members?.find((m) => m.role === "owner");
                            return owner
                              ? owner.name || owner.email
                              : "—";
                          })()}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                      <Clock className="h-4 w-4" />
                      תאריך ושעת פתיחה
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {new Date(project.created_at).toLocaleString("he-IL", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                    <Users className="h-4 w-4" />
                    משתתפים בפרויקט
                  </div>
                  {membersLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      טוען משתתפים...
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <ul className="space-y-2">
                        {members?.map((m) => (
                          <li
                            key={m.user_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                                {m.name || m.email}
                              </div>
                              {m.name && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {m.email}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge
                                variant={m.role === "owner" ? "default" : "secondary"}
                                className="rounded-full text-xs"
                              >
                                {m.role === "owner" ? "בעלים" : "צופה"}
                              </Badge>
                              {project.current_user_role === "owner" &&
                                m.role === "viewer" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={async () => {
                                      try {
                                        await api.removeProjectMember(
                                          project.id,
                                          m.user_id,
                                        );
                                        setMembers((prev) =>
                                          prev
                                            ? prev.filter(
                                                (x) => x.user_id !== m.user_id,
                                              )
                                            : [],
                                        );
                                        toast.success("המשתמש הוסר מהפרויקט");
                                      } catch (e: unknown) {
                                        const msg =
                                          e && typeof e === "object" && "message" in e
                                            ? String((e as { message: unknown }).message)
                                            : "הסרה נכשלה";
                                        toast.error(msg);
                                      }
                                    }}
                                    aria-label="הסר משתמש"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                            </div>
                          </li>
                        ))}
                        {members?.length === 0 && (
                          <li className="text-sm text-slate-500 dark:text-slate-400 py-2">
                            אין משתתפים נוספים. צרף משתמשים לפי מייל למטה.
                          </li>
                        )}
                      </ul>
                      {project.current_user_role === "owner" && (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                          <Input
                            type="email"
                            placeholder="כתובת מייל"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="max-w-xs rounded-xl"
                            dir="ltr"
                            aria-label="מייל להזמנה"
                          />
                          <Button
                            size="sm"
                            className="rounded-xl gap-1"
                            disabled={
                              !inviteEmail.trim() || addMemberLoading
                            }
                            onClick={async () => {
                              const email = inviteEmail.trim();
                              if (!email) return;
                              setAddMemberLoading(true);
                              try {
                                const added = await api.addProjectMember(
                                  project.id,
                                  email,
                                );
                                setMembers((prev) =>
                                  prev ? [...prev, added] : [added],
                                );
                                setInviteEmail("");
                                toast.success(
                                  `${added.email} צורף לפרויקט כצופה`,
                                );
                              } catch (e: unknown) {
                                const msg =
                                  e && typeof e === "object" && "message" in e
                                    ? String((e as { message: unknown }).message)
                                    : "צירוף נכשל";
                                toast.error(msg);
                              } finally {
                                setAddMemberLoading(false);
                              }
                            }}
                          >
                            {addMemberLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <UserPlus className="h-4 w-4" />
                            )}
                            צרף משתמש
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ─── Tab: DD Report ──────────────────────────────── */}
            {/* ─── Tab: DD Report ──────────────────────────────── */}
            <TabsContent value="report" className="p-5 space-y-4 m-0">
              {/* Analysis animation — always show while processing/analyzing/needs_review.
                  When hitlApproved, force-display the synthesis step so the user sees
                  the pipeline continuing even before the next poll returns. */}
              {(project.status === "processing" ||
                project.status === "needs_review" ||
                analyzing) && (
                <AnalysisStatus
                  transaction={{
                    id: project.id,
                    title: project.title,
                    description: project.description,
                    status: "processing",
                    created_at: project.created_at,
                    pipeline_stage: hitlApproved
                      ? "synthesis"
                      : analyzing && project.status !== "processing"
                        ? "doc_processing"
                        : (project.pipeline_stage ?? null),
                    documents: project.files.map((f) => ({
                      id: f.id,
                      original_filename: f.original_name,
                      doc_type: f.doc_type as "other",
                      uploaded_at: f.created_at,
                    })),
                  }}
                />
              )}

              {/* HITL bottom-sheet is rendered at the page root (outside Tabs/Card) */}

              {project.status === "failed" && !analyzing && (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center">
                  <h2 className="text-xl font-semibold text-destructive">
                    הניתוח נכשל
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    צוותנו קיבל הודעה ונטפל בהקדם. ניתן להריץ בדיקה מחדש למטה.
                  </p>
                  {canAnalyze && !isFinanceProject && (
                    <Button
                      className="mt-4 rounded-2xl"
                      onClick={handleAnalyze}
                      disabled={analyzing}
                    >
                      <RotateCcw className="h-4 w-4" />
                      הרץ בדיקה מחדש
                    </Button>
                  )}
                </div>
              )}

              {!analyzing &&
                project.status !== "processing" &&
                ["completed", "partial", "needs_review"].includes(
                  project.status,
                ) &&
                project.pipeline_stage !== "hitl_tenant_review" &&
                hasUploads && (
                  <div className="flex items-center justify-start gap-3">
                    <Button
                      variant="outline"
                      className="rounded-xl gap-2"
                      disabled={analyzing}
                      onClick={
                        isFinanceProject ? handleAnalyzeFinance : handleAnalyze
                      }
                    >
                      <RotateCcw className="h-4 w-4" />
                      הרץ בדיקה מחדש
                    </Button>
                  </div>
                )}

              {project.status === "needs_review" && !analyzing && project.pipeline_stage !== "hitl_tenant_review" && (
                <QAReviewBanner
                  qaSummary={qaSummary}
                  qaAttempts={qaAttempts}
                  reportReviewNotes={
                    reportData?.report &&
                    typeof reportData.report === "object" &&
                    "review_notes" in reportData.report
                      ? ((reportData.report as Record<string, unknown>)
                          .review_notes as string[] | undefined)
                      : undefined
                  }
                />
              )}

              {project.status === "completed" &&
                !analyzing &&
                qaAttempts > 1 &&
                qaSummary?.is_approved && (
                  <Card className="rounded-2xl border-emerald-200 bg-emerald-50 shadow-sm">
                    <CardContent className="flex items-start gap-4 py-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-emerald-900">
                          הדוח אושר לאחר תיקון אוטומטי
                        </h3>
                        <p className="mt-1 text-sm text-emerald-800">
                          שופט ה-QA זיהה ממצאים בסבב הראשון, הדוח תוקן אוטומטית
                          ואושר לאחר {qaAttempts} סבבי DD→QA.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

              {report &&
                !analyzing &&
                project.status !== "processing" &&
                ["completed", "partial", "needs_review"].includes(
                  project.status,
                ) && (
                  <ReportViewer
                    report={report}
                    projectTitle={project.title}
                    projectId={project.id}
                    projectFiles={project.files}
                    checkId={reportData?.check_id}
                  />
                )}

              {!report &&
                !analyzing &&
                project.status !== "processing" &&
                ["completed", "partial", "needs_review"].includes(
                  project.status,
                ) && (
                  <div className="rounded-2xl border bg-slate-50 p-10 text-center text-sm text-slate-500">
                    הדוח עדיין לא זמין. נסה לרענן בעוד כמה שניות.
                  </div>
                )}

              {!report && !analyzing && project.status === "pending" && (
                <div className="rounded-2xl border bg-slate-50 p-10 text-center text-sm text-slate-500">
                  טרם הורצה בדיקת נאותות. העלה מסמכים והפעל בדיקה מלשונית
                  &quot;מסמכים&quot;.
                </div>
              )}
            </TabsContent>
            {/* ─── Tab: AI Log ─────────────────────────────── */}
            {reportData?.check_id && (
              <TabsContent value="ai-log" className="p-5 m-0">
                <AgentSessionViewer
                  projectId={project.id}
                  checkId={reportData.check_id}
                />
              </TabsContent>
            )}
          </Tabs>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════
          HITL Bottom-Sheet — rendered at the root level (outside
          Cards / Tabs) so no CSS containment can interfere.
      ══════════════════════════════════════════════════════════ */}
      {isHitlPending && latestCheckId && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]" />
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6 lg:p-10">
            <div
              className="flex h-[85vh] w-full max-w-6xl shrink-0 flex-col overflow-hidden rounded-2xl border-2 border-indigo-500 bg-white shadow-xl dark:bg-slate-950 my-auto"
              style={{ animation: "slideUp 0.35s ease-out" }}
            >
            <div className="shrink-0 flex items-center justify-between rounded-t-2xl bg-indigo-600 px-5 py-3" dir="rtl">
              <div className="flex items-center gap-2 text-white">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
                <span className="text-sm font-bold">
                  הניתוח מושהה — נדרש אישורך לטבלת החתימות לפני שלב הסינתזה
                </span>
              </div>
              <span className="text-xs text-indigo-200">אשר או הצע תיקונים כדי להמשיך</span>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <TenantTableReview
                projectId={project.id}
                checkId={latestCheckId}
                files={project.files}
                className="h-full min-h-0 overflow-hidden rounded-none rounded-b-2xl border-0"
                onApproved={() => {
                  setHitlApproved(true);
                  setAnalyzing(true);
                  toast.info("הטבלה אושרה — שלב הסינתזה מתחיל...");
                  fetchData();
                }}
                onCorrectionSent={() => {
                  setHitlApproved(true);
                  setAnalyzing(true);
                  toast.info("התיקון נשלח — מחשב מחדש...");
                  fetchData();
                }}
              />
            </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
