"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ChevronDown,
  ChevronLeft,
  Copy,
  FileText,
  Home,
  Loader2,
  Maximize2,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { AgentPromptEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface TransactionTypeTab {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TRANSACTION_TABS: TransactionTypeTab[] = [
  {
    id: "real_estate.project_finance",
    label: "מימון נדל״ן",
    subtitle: "מחלצי מסמכים (Tier 1) וסינתזה (Tier 2)",
    icon: Home,
  },
];

const PIPELINE_AGENTS: {
  file_key: string;
  label: string;
  tier: 1 | 2;
  model: string;
}[] = [
  { file_key: "tabu_extract", label: "נסח טאבו", tier: 1, model: "Flash" },
  { file_key: "agreement", label: "הסכם פרויקט", tier: 1, model: "Flash" },
  { file_key: "zero_report", label: "דו״ח אפס", tier: 1, model: "Flash" },
  { file_key: "credit_committee", label: "ועדת אשראי", tier: 1, model: "Flash" },
  { file_key: "company_docs", label: "מסמכי חברה", tier: 1, model: "Flash" },
  { file_key: "signing_protocol", label: "פרוטוקול חתימה", tier: 1, model: "Flash" },
  { file_key: "planning_permit", label: "היתר בניה", tier: 1, model: "Flash" },
  { file_key: "pledges_registry", label: "רשם המשכונות", tier: 1, model: "Flash" },
  { file_key: "finance_reconciliation_logic", label: "חתם בכיר", tier: 2, model: "Pro" },
];

// ── Editor constants & helpers ────────────────────────────────

const GUTTER_W = 48;
const LINE_H = 20;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightJSON(json: string): string {
  const e = escapeHtml(json);
  return e
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"(\s*:)/g, '<span class="text-sky-700">"$1"</span>$3')
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, '<span class="text-emerald-600">"$1"</span>')
    .replace(/\b(true|false)\b/g, '<span class="text-violet-600">$1</span>')
    .replace(/\b(null)\b/g, '<span class="text-slate-400 italic">$1</span>')
    .replace(/(?<=[:,\s\[])(-?\d+(\.\d+)?)\b/gm, '<span class="text-amber-600">$1</span>');
}

function LineGutter({
  gutterRef,
  lineCount,
}: {
  gutterRef: React.RefObject<HTMLDivElement | null>;
  lineCount: number;
}) {
  return (
    <div
      ref={gutterRef}
      className="absolute left-0 top-0 bottom-0 select-none overflow-hidden border-r border-slate-200/60 bg-slate-50/80 text-[11px] text-slate-400"
      style={{ width: GUTTER_W }}
    >
      <div className="py-3">
        {Array.from({ length: Math.max(1, lineCount) }, (_, i) => (
          <div
            key={i}
            className="pr-2 text-right"
            style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorToolbar({
  filename,
  lineCount,
  charCount,
  onCopy,
  onFullscreen,
}: {
  filename: string;
  lineCount: number;
  charCount?: number;
  onCopy: () => void;
  onFullscreen: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-t-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-mono text-xs text-slate-600">{filename}</span>
        <span className="text-[10px] text-slate-400">
          {lineCount} שורות{charCount != null && ` · ${charCount.toLocaleString()} תווים`}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          className="h-7 gap-1 rounded-md px-2 text-[11px] text-slate-500"
        >
          <Copy className="h-3 w-3" />
          העתק
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onFullscreen}
          className="h-7 gap-1 rounded-md px-2 text-[11px] text-slate-500"
        >
          <Maximize2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Schema structured viewer ─────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function resolveType(prop: any): { display: string; color: string } {
  if (!prop) return { display: "any", color: "text-slate-500" };

  if (prop.$ref) {
    return { display: prop.$ref.split("/").pop()!, color: "text-sky-600" };
  }

  if (prop.allOf) {
    const ref = prop.allOf.find((x: any) => x.$ref);
    if (ref) return resolveType(ref);
  }

  if (prop.anyOf) {
    const nonNull = prop.anyOf.filter((x: any) => x.type !== "null");
    const nullable = prop.anyOf.some((x: any) => x.type === "null");
    if (nonNull.length === 1) {
      const inner = resolveType(nonNull[0]);
      return {
        display: inner.display + (nullable ? "?" : ""),
        color: inner.color,
      };
    }
    return {
      display: prop.anyOf.map((x: any) => resolveType(x).display).join(" | "),
      color: "text-slate-600",
    };
  }

  if (prop.type === "array") {
    const items = prop.items
      ? resolveType(prop.items)
      : { display: "any", color: "text-slate-500" };
    return { display: `${items.display}[]`, color: items.color };
  }

  if (prop.enum) {
    return {
      display: prop.enum.map((v: any) => `"${v}"`).join(" | "),
      color: "text-violet-600",
    };
  }

  if (prop.const !== undefined) {
    return { display: `"${prop.const}"`, color: "text-violet-600" };
  }

  const typeColors: Record<string, string> = {
    string: "text-emerald-600",
    integer: "text-amber-600",
    number: "text-amber-600",
    boolean: "text-violet-600",
    object: "text-slate-600",
    null: "text-slate-400",
  };

  if (prop.type && typeColors[prop.type]) {
    return { display: prop.type, color: typeColors[prop.type] };
  }

  return { display: prop.type || "any", color: "text-slate-500" };
}

function SchemaFieldsView({
  schema,
  className,
}: {
  schema: Record<string, any>;
  className?: string;
}) {
  const defs = schema.$defs || schema.definitions || {};

  const models: {
    name: string;
    description?: string;
    properties: Record<string, any>;
    required: string[];
  }[] = [];

  if (schema.properties) {
    models.push({
      name: schema.title || "Root",
      description: schema.description,
      properties: schema.properties,
      required: schema.required || [],
    });
  }

  for (const [name, def] of Object.entries<any>(defs)) {
    if (def.properties) {
      models.push({
        name,
        description: def.description,
        properties: def.properties,
        required: def.required || [],
      });
    }
  }

  if (models.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-400">
        No schema fields found.
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)} dir="ltr">
      {models.map((model) => {
        const fields = Object.entries<any>(model.properties);
        if (fields.length === 0) return null;

        return (
          <div key={model.name}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="font-mono text-[13px] font-bold text-sky-700">
                {model.name}
              </span>
              {model.description && (
                <span className="text-[11px] text-slate-400 truncate">
                  {model.description}
                </span>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-medium text-slate-500">
                    <th className="px-3 py-2 w-[22%]">Field</th>
                    <th className="px-3 py-2 w-[20%]">Type</th>
                    <th className="px-3 py-2 w-[14%]">Default</th>
                    <th className="px-3 py-2">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(([name, def]) => {
                    const typeInfo = resolveType(def);
                    const isRequired = model.required.includes(name);
                    const defVal = def.default;

                    return (
                      <tr
                        key={name}
                        className="border-t border-slate-100 transition-colors hover:bg-slate-50/50"
                      >
                        <td className="px-3 py-1.5 font-mono font-medium text-slate-900">
                          {name}
                          {isRequired && (
                            <span className="ml-0.5 text-red-400">*</span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-1.5 font-mono",
                            typeInfo.color,
                          )}
                        >
                          {typeInfo.display}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-slate-400">
                          {defVal === undefined
                            ? "—"
                            : defVal === null
                              ? <span className="italic">null</span>
                              : String(JSON.stringify(defVal))}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600">
                          {def.description || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Pipeline Diagram ─────────────────────────────────────────
// Single source of truth: same order as backend AGENT_PROMPT_FILES.
// All agents from the flow (Tier 1 extractors + Tier 2 synthesis) are listed here.

function PipelineDiagram({ onAgentClick }: { onAgentClick: (fileKey: string) => void }) {
  const tier1 = PIPELINE_AGENTS.filter((a) => a.tier === 1);
  const tier2 = PIPELINE_AGENTS.find((a) => a.tier === 2)!;

  return (
    <Card className="rounded-2xl border border-slate-100 bg-white shadow-none overflow-hidden">
      <CardHeader className="pb-2 pt-6">
        <CardTitle className="text-lg font-semibold text-slate-800">
          זרימת הסוכנים — מימון נדל״ן
        </CardTitle>
        <p className="text-xs text-slate-500 mt-0.5">
          לחץ על סוכן כדי לקפוץ לעריכת הפרומפט שלו
        </p>
      </CardHeader>
      <CardContent className="pb-8 pt-2">
        <div className="flex flex-col items-center gap-4">
          {/* Upload */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-6 py-3 text-sm font-medium text-slate-600">
            העלאת מסמכים
          </div>
          <ArrowDown className="h-4 w-4 text-slate-300 shrink-0" />

          {/* Tier 1 — Parallel */}
          <div className="w-full rounded-2xl border border-slate-100 bg-slate-50/40 px-5 py-5">
            <div className="mb-3 flex items-center justify-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Tier 1
              </span>
              <span className="text-xs text-slate-500">
                מחלצי מסמכים (רצים במקביל)
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {tier1.map((agent) => (
                <button
                  key={agent.file_key}
                  type="button"
                  onClick={() => onAgentClick(agent.file_key)}
                  className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-colors hover:border-sky-200 hover:bg-sky-50/50"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400 group-hover:bg-sky-500" />
                  <span className="font-medium text-slate-700 group-hover:text-slate-900">
                    {agent.label}
                  </span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {agent.model}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <ArrowDown className="h-4 w-4 text-slate-300 shrink-0" />

          {/* Tier 2 — Synthesis */}
          <button
            type="button"
            onClick={() => onAgentClick(tier2.file_key)}
            className="group flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-800 px-5 py-3 text-sm transition-colors hover:bg-slate-700"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-sky-300" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
              Tier 2
            </span>
            <span className="font-semibold text-white">
              {tier2.label}
            </span>
            <span className="text-[10px] text-slate-400">
              {tier2.model} · Thinking
            </span>
          </button>

          <ArrowDown className="h-4 w-4 text-slate-300 shrink-0" />

          {/* Output */}
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-6 py-3 text-sm font-medium text-emerald-800">
            דוח DD מלא
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentPromptCard({
  entry,
  transactionType,
  onSaved,
  forwardedRef,
}: {
  entry: AgentPromptEntry;
  transactionType: string;
  onSaved: (fileKey: string, newContent: string) => void;
  forwardedRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState(entry.content);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"prompt" | "schema">("prompt");

  const [promptFs, setPromptFs] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [schemaData, setSchemaData] = useState<Record<string, any> | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaFs, setSchemaFs] = useState(false);
  const schemaJson = schemaData ? JSON.stringify(schemaData, null, 2) : "";

  const pGutter = useRef<HTMLDivElement>(null);
  const pFsGutter = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContent(entry.content);
    setDirty(false);
  }, [entry.content]);

  function handleChange(v: string) {
    setContent(v);
    setDirty(v !== entry.content);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await api.updateAgentPrompt(transactionType, entry.file_key, content);
      onSaved(res.file_key, res.content);
      setDirty(false);
      toast.success(`"${entry.label_he}" נשמר`);
    } catch (err) {
      toast.error("שמירה נכשלה", {
        description: err instanceof Error ? err.message : "נסה שנית",
      });
    } finally {
      setSaving(false);
    }
  }

  function copyText(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success("הועתק"),
      () => toast.error("ההעתקה נכשלה"),
    );
  }

  async function loadSchema() {
    if (schemaData || schemaLoading) return;
    setSchemaLoading(true);
    try {
      const res = await api.getAgentSchema(entry.file_key);
      setSchemaData(res.schema as Record<string, unknown>);
    } catch {
      toast.error("שגיאה בטעינת סכמה");
    } finally {
      setSchemaLoading(false);
    }
  }

  function syncGutter(ref: React.RefObject<HTMLDivElement | null>, scrollTop: number) {
    if (ref.current) ref.current.scrollTop = scrollTop;
  }

  const isSynthesis = entry.file_key === "finance_reconciliation_logic";
  const promptLines = content.split("\n").length;

  return (
    <>
      <Card ref={forwardedRef} className="rounded-2xl bg-white shadow-sm overflow-hidden">
        {/* ── Collapsible header ── */}
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex w-full items-center gap-3 px-5 py-4 text-right transition-colors duration-150 hover:bg-slate-50/60"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <FileText className="h-4 w-4 text-slate-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{entry.label_he}</span>
              <Badge
                variant={isSynthesis ? "secondary" : "outline"}
                className="rounded-full text-[10px]"
              >
                {isSynthesis ? "Tier 2" : "Tier 1"}
              </Badge>
              {dirty && (
                <Badge className="rounded-full bg-amber-100 text-amber-800 text-[10px]">
                  שונה
                </Badge>
              )}
            </div>
            <span className="mt-0.5 block text-xs text-slate-500">
              {entry.file_key}.md · {isSynthesis ? "Pro · Thinking" : "Flash"}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300",
              expanded && "rotate-180",
            )}
          />
        </button>

        {/* ── Collapsible body ── */}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-in-out",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-slate-100 p-4">
              {/* Tab pills */}
              <div className="mb-4 flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit" dir="rtl">
                <button
                  type="button"
                  onClick={() => setSelectedTab("prompt")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedTab === "prompt"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  פרומפט
                </button>
                <button
                  type="button"
                  onClick={() => {
                    loadSchema();
                    setSelectedTab("schema");
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedTab === "schema"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  סכמה
                </button>
              </div>

              {/* ── Prompt tab ── */}
              {selectedTab === "prompt" && (
                <div>
                  <EditorToolbar
                    filename={`${entry.file_key}.md`}
                    lineCount={promptLines}
                    charCount={content.length}
                    onCopy={() => copyText(content)}
                    onFullscreen={() => setPromptFs(true)}
                  />
                  <div
                    className="relative flex overflow-hidden rounded-b-lg border border-t-0 border-slate-200 bg-white"
                    style={{ minHeight: 300, maxHeight: 500 }}
                    dir="ltr"
                  >
                    <LineGutter gutterRef={pGutter} lineCount={promptLines} />
                    <textarea
                      value={content}
                      onChange={(e) => handleChange(e.target.value)}
                      onScroll={(e) => syncGutter(pGutter, e.currentTarget.scrollTop)}
                      spellCheck={false}
                      className="flex-1 resize-none bg-transparent py-3 font-mono text-[13px] text-slate-800 outline-none"
                      style={{ paddingLeft: GUTTER_W + 16, lineHeight: `${LINE_H}px` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <Button
                      onClick={handleSave}
                      disabled={saving || !dirty}
                      size="sm"
                      className="gap-1.5 rounded-xl"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {saving ? "שומר..." : "שמור"}
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Schema tab ── */}
              {selectedTab === "schema" && (
                <div>
                  {schemaLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                  ) : schemaData ? (
                    <>
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-mono text-xs text-slate-500">
                          {entry.file_key}.schema.json
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyText(schemaJson)}
                            className="h-7 gap-1 rounded-md px-2 text-[11px] text-slate-500"
                          >
                            <Copy className="h-3 w-3" />
                            העתק JSON
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSchemaFs(true)}
                            className="h-7 gap-1 rounded-md px-2 text-[11px] text-slate-500"
                          >
                            <Maximize2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-[500px] overflow-auto rounded-lg border border-slate-200 bg-white p-4">
                        <SchemaFieldsView schema={schemaData} />
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Prompt fullscreen dialog ── */}
      <Dialog open={promptFs} onOpenChange={setPromptFs}>
        <DialogContent
          className="flex h-[90vh] max-w-[calc(100%-4rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
          showCloseButton={false}
        >
          <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="font-mono text-sm font-medium text-slate-700">
                {entry.file_key}.md
              </span>
              <span className="text-xs text-slate-400">
                {promptLines} שורות · {content.length.toLocaleString()} תווים
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyText(content)}
                className="h-8 gap-1.5 text-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                העתק
              </Button>
              <DialogClose asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  סגור
                </Button>
              </DialogClose>
            </div>
          </div>
          <div className="relative flex flex-1 overflow-hidden" dir="ltr">
            <LineGutter gutterRef={pFsGutter} lineCount={promptLines} />
            <textarea
              value={content}
              onChange={(e) => handleChange(e.target.value)}
              onScroll={(e) => syncGutter(pFsGutter, e.currentTarget.scrollTop)}
              spellCheck={false}
              className="flex-1 resize-none bg-white py-3 font-mono text-[13px] text-slate-800 outline-none"
              style={{ paddingLeft: GUTTER_W + 16, lineHeight: `${LINE_H}px` }}
            />
          </div>
          <div className="flex items-center justify-end border-t bg-slate-50 px-4 py-3">
            <Button
              onClick={handleSave}
              disabled={saving || !dirty}
              size="sm"
              className="gap-1.5 rounded-xl"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? "שומר..." : "שמור"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Schema fullscreen dialog ── */}
      <Dialog open={schemaFs} onOpenChange={setSchemaFs}>
        <DialogContent
          className="flex h-[90vh] max-w-[calc(100%-4rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
          showCloseButton={false}
        >
          <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="font-mono text-sm font-medium text-slate-700">
                {entry.file_key}.schema.json
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyText(schemaJson)}
                className="h-8 gap-1.5 text-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                העתק JSON
              </Button>
              <DialogClose asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  סגור
                </Button>
              </DialogClose>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-white p-6">
            {schemaData && <SchemaFieldsView schema={schemaData} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AiPromptsSettingsPage() {
  const [activeTab, setActiveTab] = useState(TRANSACTION_TABS[0].id);
  const [prompts, setPrompts] = useState<
    Record<string, AgentPromptEntry[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [cardRefs, setCardRefs] = useState<
    Record<string, React.RefObject<HTMLDivElement | null>>
  >({});

  const fetchPrompts = useCallback(async (txType: string) => {
    try {
      const res = await api.getAgentPrompts(txType);
      setPrompts((prev) => ({ ...prev, [txType]: res.prompts }));

      const refs: Record<string, React.RefObject<HTMLDivElement | null>> = {};
      for (const p of res.prompts) {
        refs[p.file_key] = { current: null };
      }
      setCardRefs((prev) => ({ ...prev, ...refs }));
    } catch (err) {
      toast.error("שגיאה בטעינת פרומפטים", {
        description: err instanceof Error ? err.message : "נסה שנית",
      });
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all(TRANSACTION_TABS.map((t) => fetchPrompts(t.id))).finally(() =>
      setLoading(false),
    );
  }, [fetchPrompts]);

  function handlePromptSaved(
    txType: string,
    fileKey: string,
    newContent: string,
  ) {
    setPrompts((prev) => {
      const list = prev[txType] ?? [];
      return {
        ...prev,
        [txType]: list.map((p) =>
          p.file_key === fileKey ? { ...p, content: newContent } : p,
        ),
      };
    });
  }

  function scrollToAgent(fileKey: string) {
    const ref = cardRefs[fileKey];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
      ref.current.classList.add("ring-2", "ring-blue-400", "ring-offset-2");
      setTimeout(() => {
        ref.current?.classList.remove("ring-2", "ring-blue-400", "ring-offset-2");
      }, 2000);
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="shrink-0 rounded-xl text-slate-400 hover:text-slate-700"
              >
                <Link href="/settings">
                  <ChevronLeft className="h-5 w-5" />
                </Link>
              </Button>
              <h1 className="flex items-center gap-2 text-3xl font-bold">
                <Sparkles className="h-6 w-6" />
                ניהול פרומפטים AI
              </h1>
            </div>
            <p className="mt-1 text-muted-foreground">
              עריכת הנחיות הסוכנים לפי סוג עסקה. שינויים ישפיעו על כל
              ההרצות הבאות.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            dir="rtl"
          >
            {/* Tabs header intentionally removed */}

            {TRANSACTION_TABS.map((t) => {
              const list = prompts[t.id] ?? [];
              const order = PIPELINE_AGENTS.map((a) => a.file_key);
              const extractors = order
                .filter((fileKey) => fileKey !== "finance_reconciliation_logic")
                .map((fileKey) => list.find((p) => p.file_key === fileKey))
                .filter((p): p is AgentPromptEntry => p != null);
              const synthesizer = list.find(
                (p) => p.file_key === "finance_reconciliation_logic",
              );

              return (
                <TabsContent key={t.id} value={t.id} className="mt-4 space-y-6">
                  {/* Pipeline diagram */}
                  <PipelineDiagram onAgentClick={scrollToAgent} />

                  {/* Extractors (Tier 1) */}
                  {extractors.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-slate-700 px-1">
                        מחלצי מסמכים (Tier 1)
                      </h3>
                      <div className="space-y-2">
                        {extractors.map((entry) => (
                          <AgentPromptCard
                            key={entry.file_key}
                            entry={entry}
                            transactionType={t.id}
                            onSaved={(fk, nc) =>
                              handlePromptSaved(t.id, fk, nc)
                            }
                            forwardedRef={cardRefs[entry.file_key]}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Synthesizer (Tier 2) */}
                  {synthesizer && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-slate-700 px-1">
                        סינתזה — חתם בכיר (Tier 2)
                      </h3>
                      <AgentPromptCard
                        entry={synthesizer}
                        transactionType={t.id}
                        onSaved={(fk, nc) =>
                          handlePromptSaved(t.id, fk, nc)
                        }
                        forwardedRef={cardRefs[synthesizer.file_key]}
                      />
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </>
  );
}
