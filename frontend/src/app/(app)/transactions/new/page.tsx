"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  FileUp,
  LineChart,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { setProjectDealType } from "@/lib/deal-type-store";

import {
  CreationStepper,
  getStepsForType,
  type CreationStepId,
} from "@/components/creation-stepper";
import {
  FileUploadZone,
  useFileUpload,
  type FileEntry,
  type FolderEntry,
} from "@/components/file-upload-zone";
import { AnalysisStatus } from "@/components/analysis-status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const STEP_KEYS = ["type", "details", "chapters", "documents", "analysis"] as const;
type Step = CreationStepId;

const OPTIONAL_CHAPTER_DEFS: Array<{
  id: string;
  label: string;
  description: string;
}> = [
  {
    id: "intellectual_property",
    label: "Intellectual Property (IP)",
    description: "בעלות IP, שרשרת בעלות, רישיונות, OSS ומחלוקות",
  },
  {
    id: "physical_assets",
    label: "Physical Assets",
    description: "נדל\"ן, חכירות מהותיות, ציוד ונכסים פיזיים",
  },
  {
    id: "privacy_and_cyber",
    label: "Privacy & Cyber",
    description: "GDPR, מדיניות פרטיות, מחויבויות אבטחה ואירועים",
  },
  {
    id: "esg_environmental",
    label: "Environmental & ESG",
    description: "היתרים סביבתיים, ממצאי ביקורת, קנסות ומחויבויות ESG",
  },
  {
    id: "intangible_assets",
    label: "Intangible Assets",
    description: "מוניטין, סודות מסחריים, know-how ורשימות לקוחות",
  },
];

function playSuccessSound() {
  try {
    const ctx = new AudioContext();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    // AudioContext not available
  }
}

type TransactionType = "real_estate_financing" | "ma" | "company_investment";
type PartyRole = "bank" | "insurance" | "fund" | "other";
type MaRole = "buyer" | "investor" | "other";

const ROLE_LABELS: Record<PartyRole, string> = {
  bank: "בנק",
  insurance: "חברת ביטוח",
  fund: "קרן",
  other: "אחר",
};

const MA_ROLE_LABELS: Record<MaRole, string> = {
  buyer: "הרוכש",
  investor: "המשקיע",
  other: "אחר",
};

const TRANSACTION_TYPES: Array<{
  id: TransactionType;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "real_estate_financing",
    title: "מימון נדל״ן",
    subtitle: "בדיקת נאותות למימון פרויקטי נדל״ן ובנייה",
    icon: Building2,
  },
  {
    id: "ma",
    title: "M&A",
    subtitle: "מיזוגים ורכישות של חברות",
    icon: BriefcaseBusiness,
  },
  {
    id: "company_investment",
    title: "השקעה בחברה",
    subtitle: "בדיקת נאותות להשקעה בחברות",
    icon: LineChart,
  },
];

export default function NewTransactionPage() {
  const router = useRouter();
  const { uploadAll, abort, isUploading } = useFileUpload({ concurrency: 3 });

  const [step, setStep] = useState<Step>("type");
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [transactionType, setTransactionType] =
    useState<TransactionType | null>(null);
  const isFinance = transactionType === "real_estate_financing";

  // Step 2.5: Optional chapters (M&A only)
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  function toggleChapter(id: string) {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Step 1: Details
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [role, setRole] = useState<PartyRole>("bank");
  const [maRole, setMaRole] = useState<MaRole>("buyer");
  const [roleOtherText, setRoleOtherText] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [description, setDescription] = useState("");

  // Labels that shift per transaction type. For M&A the "counterparty" and
  // the "role" fields are different from the finance flow, so we swap
  // copy/options without forking the form.
  const isMa = transactionType === "ma";
  const counterpartyLabel = isMa ? "שם הצד שכנגד (Counterparty)" : "שם היזם";
  const roleLabel = "מי אתה מייצג בעסקה?";
  const [detailErrors, setDetailErrors] = useState<{
    transactionType?: string;
    projectName?: string;
    clientName?: string;
    role?: string;
  }>({});

  // Processing flow — always use Gemini 3.1 Pro (visual grounding)

  // Step 3: File list + folder organisation
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const updateFileAt = useCallback(
    (index: number, patch: Partial<FileEntry>) => {
      setFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  // Step 4: analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [projectForAnalysis, setProjectForAnalysis] =
    useState<api.Project | null>(null);
  const analysisStartedRef = useRef(false);

  const anyUploaded = useMemo(
    () => files.some((f) => f.status === "complete"),
    [files],
  );

  function currentRoleLabel(): string {
    if (isMa) {
      return maRole === "other" && roleOtherText.trim()
        ? `אחר: ${roleOtherText.trim()}`
        : MA_ROLE_LABELS[maRole];
    }
    return role === "other" && roleOtherText.trim()
      ? `אחר: ${roleOtherText.trim()}`
      : ROLE_LABELS[role];
  }

  function buildProjectDescription(): string | undefined {
    // Kept for the free-text description field only — structured data now
    // travels as ``transaction_metadata`` on the create-project payload.
    return description.trim() || undefined;
  }

  function validateDetails(): boolean {
    const next: typeof detailErrors = {};
    if (!transactionType) next.transactionType = "יש לבחור סוג עסקה";
    if (!projectName.trim()) next.projectName = "יש להזין שם פרויקט";
    if (!clientName.trim()) next.clientName = "יש להזין שם לקוח";
    if (!role) next.role = "יש לבחור תפקיד";
    setDetailErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleNextFromDetails() {
    if (!validateDetails()) {
      toast.error("חסרים פרטים חובה", {
        description: "אנא השלם את השדות המסומנים בכוכבית.",
      });
      return;
    }
    await handleCreateAndContinue();
  }

  async function handleNextFromChapters() {
    setStep("documents");
  }

  async function handleCreateAndContinue() {
    if (!transactionType) return;
    if (!projectName.trim() || !clientName.trim()) return;
    setCreatingProject(true);
    try {
      const selectedRole = currentRoleLabel();
      const project = await api.createProject({
        transaction_type: transactionType,
        project_name: projectName.trim(),
        client_name: clientName.trim(),
        role: selectedRole,
        role_other:
          (isMa ? maRole : role) === "other" ? roleOtherText.trim() : null,
        counterparty_name: counterpartyName.trim() || null,
        description: buildProjectDescription() ?? null,
      });
      if (transactionType === "real_estate_financing") {
        setProjectDealType(project.id, "real_estate", "project_finance");
      } else if (transactionType === "ma") {
        setProjectDealType(project.id, "ma", null);
      } else {
        setProjectDealType(project.id, "company_investment", null);
      }
      setProjectId(project.id);
      if (transactionType === "ma") {
        toast.success("הפרויקט נוצר. בחר את הפרקים הרצויים.");
        setDetailErrors({});
        setStep("chapters");
      } else {
        toast.success("הפרויקט נוצר. עכשיו נעלה את המסמכים.");
        setDetailErrors({});
        setStep("documents");
      }
    } catch (err) {
      toast.error("שגיאה ביצירת פרויקט", {
        description: err instanceof Error ? err.message : "נסה שנית",
      });
    } finally {
      setCreatingProject(false);
    }
  }

  const handleUploadThenClassifyAndContinue = useCallback(async () => {
    if (!projectId || files.length === 0) {
      toast.error("יש לבחור לפחות מסמך אחד");
      return;
    }
    const pending = files.filter((f) => f.status !== "complete");
    if (pending.length === 0) {
      setStep("analysis");
      return;
    }
    try {
      const { completed, failed } = await uploadAll(
        files,
        projectId,
        updateFileAt,
      );
      if (failed > 0 && completed === 0) {
        toast.error("כל ההעלאות נכשלו");
        return;
      }
      if (failed > 0) {
        toast.warning(`הועלו ${completed} קבצים, ${failed} נכשלו`);
      } else {
        toast.success("המסמכים הועלו בהצלחה!");
      }
      setStep("analysis");
    } catch (err) {
      toast.error("שגיאה בהעלאה", {
        description: err instanceof Error ? err.message : "נסה שנית",
      });
    }
  }, [files, projectId, updateFileAt, uploadAll]);

  // Auto-upload: when files are added on the documents step, start uploading
  // after a short debounce (to collect multi-file drops before firing).
  useEffect(() => {
    if (step !== "documents" || !projectId || isUploading) return;
    const hasPending = files.some((f) => f.status === "pending");
    if (!hasPending) return;
    const timer = setTimeout(() => {
      handleUploadThenClassifyAndContinue();
    }, 500);
    return () => clearTimeout(timer);
  }, [files, step, projectId, isUploading, handleUploadThenClassifyAndContinue]);

  function handleCancelUpload() {
    abort();
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "uploading"
          ? { ...f, status: "pending" as const, progress: 0 }
          : f,
      ),
    );
  }

  // Step 4: auto-start analysis and poll until completed/failed
  useEffect(() => {
    if (step !== "analysis" || !projectId) return;
    let cancelled = false;

    async function run() {
      if (analysisStartedRef.current) return;
      analysisStartedRef.current = true;
      setAnalyzing(true);
      setAnalysisError(null);

      try {
        if (!projectId) return;
        const project = await api.getProject(projectId);
        if (cancelled) return;
        setProjectForAnalysis(project);

        const options =
          transactionType === "real_estate_financing"
            ? {
                deal_type: "real_estate" as const,
                real_estate_type: "project_finance" as const,
                use_visual_grounding: true,
              }
            : transactionType === "ma"
            ? { optional_chapters: Array.from(selectedChapters) }
            : undefined;

        api.analyzeProjectWithOptions(projectId, options).catch(() => {
          if (!cancelled) {
            setAnalysisError("הניתוח נכשל. צוותנו קיבל הודעה ונטפל בהקדם.");
            setAnalyzing(false);
            analysisStartedRef.current = false;
          }
        });

        if (cancelled) return;

        const poll = async () => {
          const p = await api.getProject(projectId);
          if (cancelled) return;
          setProjectForAnalysis(p);
          if (p.status === "completed") {
            setAnalysisDone(true);
            setAnalyzing(false);
            playSuccessSound();
            return;
          }
          if (p.status === "needs_review") {
            setAnalyzing(false);
            router.push(`/transactions/${projectId}?tab=report`);
            return;
          }
          if (p.status === "failed" || p.status === "partial") {
            setAnalysisError(
              p.status === "failed"
                ? "הניתוח נכשל. צוותנו קיבל הודעה ונטפל בהקדם."
                : "הניתוח הושלם חלקית",
            );
            setAnalyzing(false);
            return;
          }
          setTimeout(poll, 2000);
        };
        poll();
      } catch (err) {
        if (!cancelled) {
          setAnalysisError("הניתוח נכשל. צוותנו קיבל הודעה ונטפל בהקדם.");
          setAnalyzing(false);
          analysisStartedRef.current = false;
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [step, projectId, transactionType, selectedChapters]);

  // While analyzing, poll project so progress (pipeline_stage) updates in the UI
  useEffect(() => {
    if (!analyzing || !projectId) return;
    const t = setInterval(async () => {
      try {
        const p = await api.getProject(projectId);
        setProjectForAnalysis(p);
      } catch {
        // ignore
      }
    }, 2000);
    return () => clearInterval(t);
  }, [analyzing, projectId]);

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6">
        <Button
          variant="ghost"
          className="gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
          onClick={() => router.push("/dashboard")}
        >
          חזור ללוח בקרה
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <CreationStepper
          currentStep={step}
          steps={getStepsForType(isMa)}
          onStepClick={(s) => setStep(s)}
          className="mb-2"
        />

        {/* Step 1: transaction type */}
        {step === "type" ? (
          <div className="rounded-3xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 p-8 shadow-sm">
            <h1 className="text-center text-3xl font-bold text-slate-900 dark:text-slate-100">
              פרויקט חדש
            </h1>
            <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
              בחר את סוג העסקה
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {TRANSACTION_TYPES.map((t) => {
                const Icon = t.icon;
                const selected = transactionType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTransactionType(t.id);
                      setProjectId(null);
                      setFiles([]);
                      setFolders([]);
                      setStep("details");
                    }}
                    className={[
                      "group rounded-2xl border p-6 shadow-sm transition",
                      selected
                        ? "border-slate-900 dark:border-slate-400 ring-2 ring-slate-900/10 dark:ring-slate-400/20"
                        : "border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/70 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {t.title}
                        </div>
                        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {t.subtitle}
                        </div>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-600/50 bg-slate-50 dark:bg-zinc-800/70 text-slate-700 dark:text-slate-300">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : step === "details" ? (
          <Card className="rounded-3xl bg-white dark:bg-zinc-900/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">פרטי הפרויקט</CardTitle>
              <CardDescription>
                {isFinance
                  ? 'עסקת "מימון נדל״ן" — הזן פרטים כדי להמשיך למסמכי החובה'
                  : "הזן פרטים כדי להמשיך למסמכים"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="projectName">
                    שם הפרויקט <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="projectName"
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value);
                      setDetailErrors((prev) => ({
                        ...prev,
                        projectName: undefined,
                      }));
                    }}
                    placeholder='לדוגמה: "יעקב דה האז 14-16"'
                    className="rounded-2xl"
                  />
                  {detailErrors.projectName ? (
                    <div className="text-xs text-red-600">
                      {detailErrors.projectName}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clientName">
                    שם הלקוח <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="clientName"
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      setDetailErrors((prev) => ({
                        ...prev,
                        clientName: undefined,
                      }));
                    }}
                    placeholder='לדוגמה: "בנק X"'
                    className="rounded-2xl"
                  />
                  {detailErrors.clientName ? (
                    <div className="text-xs text-red-600">
                      {detailErrors.clientName}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>
                      {roleLabel} <span className="text-red-500">*</span>
                    </Label>
                    {isMa ? (
                      <Select
                        value={maRole}
                        onValueChange={(v) => setMaRole(v as MaRole)}
                      >
                        <SelectTrigger className="rounded-2xl">
                          <SelectValue placeholder="בחר תפקיד" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(MA_ROLE_LABELS).map(([k, label]) => (
                            <SelectItem key={k} value={k}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={role}
                        onValueChange={(v) => setRole(v as PartyRole)}
                      >
                        <SelectTrigger className="rounded-2xl">
                          <SelectValue placeholder="בחר תפקיד" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS).map(([k, label]) => (
                            <SelectItem key={k} value={k}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {(isMa ? maRole : role) === "other" ? (
                      <Input
                        value={roleOtherText}
                        onChange={(e) => setRoleOtherText(e.target.value)}
                        placeholder="פרט את המיוצג"
                        className="mt-2 rounded-2xl"
                      />
                    ) : null}
                    {detailErrors.role ? (
                      <div className="text-xs text-red-600">
                        {detailErrors.role}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="counterparty">{counterpartyLabel}</Label>
                    <Input
                      id="counterparty"
                      value={counterpartyName}
                      onChange={(e) => setCounterpartyName(e.target.value)}
                      placeholder={
                        isMa
                          ? 'לדוגמה: "Acme Industries Ltd"'
                          : 'לדוגמה: "חברת יזמות בע״מ"'
                      }
                      className="rounded-2xl"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="desc">תיאור הפרויקט</Label>
                  <Textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="תיאור קצר של העסקה והנקודות החשובות..."
                    className="min-h-[140px] rounded-2xl"
                  />
                </div>

              </div>

              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => setStep("type")}
                >
                  חזרה
                </Button>

                <Button
                  type="button"
                  onClick={handleNextFromDetails}
                  disabled={creatingProject}
                  size="lg"
                  className="rounded-2xl"
                >
                  {creatingProject ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : null}
                  המשך למסמכים
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : step === "chapters" ? (
          <Card className="rounded-3xl bg-white dark:bg-zinc-900/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">בחירת פרקים לניתוח</CardTitle>
              <CardDescription>
                10 פרקי חובה ינותחו תמיד. בחר אילו פרקים נוספים לכלול בדוח.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-2xl border border-slate-200 dark:border-zinc-700/50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">
                  פרקי חובה (10) — נכללים תמיד
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {[
                    "Transaction Overview",
                    "Corporate Governance",
                    "Customer Obligations",
                    "Supplier Obligations",
                    "Human Resources",
                    "Regulatory & Licensing",
                    "Litigation & Risks",
                    "Taxation",
                    "Financial Debt",
                    "Insurance",
                  ].map((name) => (
                    <div key={name} className="flex items-center gap-2 min-w-0">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500 flex-none" />
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-zinc-700/50 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800/60 border-b border-slate-200 dark:border-zinc-700/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    פרקים לבחירה (5)
                  </p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-zinc-700/30">
                  {OPTIONAL_CHAPTER_DEFS.map((ch) => {
                    const selected = selectedChapters.has(ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleChapter(ch.id)}
                        className="w-full flex items-center gap-4 px-4 py-3.5 text-right transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                      >
                        <div
                          className={[
                            "flex-none flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-900",
                          ].join(" ")}
                        >
                          {selected && (
                            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{ch.label}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ch.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => setStep("details")}
                >
                  חזרה
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="rounded-2xl"
                  onClick={handleNextFromChapters}
                >
                  המשך להעלאת מסמכים
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : step === "documents" ? (
          <Card className="rounded-3xl bg-white dark:bg-zinc-900/80 shadow-sm">
            <>
              <CardHeader>
                <CardTitle className="text-2xl">מסמכים</CardTitle>
                <CardDescription>
                  העלה את כל המסמכים הרלוונטיים לעסקה.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FileUploadZone
                  files={files}
                  onFilesChange={setFiles}
                  isUploading={isUploading}
                  showDocTypeSelector={false}
                  acceptLabel="PDF, Word, Excel, תמונות ועוד"
                  showFolders={true}
                  folders={folders}
                  onFoldersChange={setFolders}
                />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => setStep(isMa ? "chapters" : "details")}
                    disabled={isUploading}
                  >
                    {isMa ? "ערוך פרקים" : "ערוך פרטים"}
                  </Button>
                  <div className="flex items-center gap-3">
                    {isUploading && (
                      <>
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          מעלה מסמכים...
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelUpload}
                          className="rounded-2xl"
                        >
                          ביטול
                        </Button>
                      </>
                    )}
                    {!isUploading && files.length > 0 && !files.some(f => f.status === "pending") && (
                      <Button
                        onClick={handleUploadThenClassifyAndContinue}
                        size="lg"
                        className="rounded-2xl"
                      >
                        <FileUp className="ml-2 h-4 w-4" />
                        המשך לניתוח
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </>
          </Card>
        ) : (
          /* Step 4: Analysis */
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">ניתוח</h2>
              <p className="text-muted-foreground text-sm mt-1">הרצת בדיקת נאותות — המערכת מנתחת את המסמכים ומפיקה דוח.</p>
            </div>
            <div className="space-y-6">
              {analysisError ? (
                <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50/50 p-4">
                  <p className="text-sm text-red-800">{analysisError}</p>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => {
                      setAnalysisError(null);
                      analysisStartedRef.current = false;
                    }}
                  >
                    נסה שוב
                  </Button>
                </div>
              ) : analysisDone && projectForAnalysis ? (
                <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
                  <p className="font-medium text-emerald-800">
                    הניתוח הושלם בהצלחה
                  </p>
                  <Button
                    className="rounded-2xl"
                    onClick={() =>
                      projectId &&
                      router.push(`/transactions/${projectId}?tab=report`)
                    }
                  >
                    צפה בדוח המלא
                  </Button>
                </div>
              ) : projectId && projectName ? (
                <AnalysisStatus
                  transaction={{
                    id: projectId,
                    title: projectName,
                    status: analyzing
                      ? "processing"
                      : (projectForAnalysis?.status ?? "pending"),
                    created_at:
                      projectForAnalysis?.created_at ??
                      new Date().toISOString(),
                    pipeline_stage:
                      analyzing && !projectForAnalysis?.pipeline_stage
                        ? "doc_processing"
                        : (projectForAnalysis?.pipeline_stage ?? null),
                    documents: projectForAnalysis?.files?.map((f) => ({
                      id: f.id,
                      original_filename: f.original_name,
                      doc_type: f.doc_type,
                    })),
                  }}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
