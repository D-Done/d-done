"use client";

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
  MaCorporateOwnershipAnchor,
  MaCustomerAnchor,
  MaSupplierAnchor,
  MaHrAggregateAnchor,
  MaRegulatoryAnchor,
  MaLitigationAnchor,
  MaTaxationAnchor,
  MaFinancialDebtAnchor,
  MaInsuranceAnchor,
  MaEsgAnchor,
  MaPhysicalAssetsAnchor,
  MaPrivacyCyberAnchor,
  MaIpAnchor,
  MaIntangibleAssetsAnchor,
} from "@/lib/types";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Shield,
  Users,
} from "lucide-react";

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

// ---------------------------------------------------------------------------
// Chapter order for display
// ---------------------------------------------------------------------------

const CHAPTER_ORDER: MaChapterId[] = [
  "corporate_governance",
  "customer_obligations",
  "supplier_obligations",
  "hr",
  "regulatory",
  "litigation",
  "taxation",
  "financial_debt",
  "insurance",
  "intellectual_property",
  "physical_assets",
  "privacy_and_cyber",
  "esg_environmental",
  "intangible_assets",
];

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  warning: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  info: "bg-slate-50 dark:bg-zinc-800/40 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700/50",
};

const SEVERITY_BADGE_CLASSES: Record<string, string> = {
  critical: "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300",
  warning: "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
  info: "border-slate-300 dark:border-zinc-600/50 bg-slate-50 dark:bg-zinc-800/70 text-slate-600 dark:text-slate-400",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "קריטי",
  warning: "אזהרה",
  info: "מידע",
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function val(v: unknown): string {
  if (v === null || v === undefined || v === "unknown" || v === "") return "—";
  return String(v);
}

function boolLabel(v: boolean | "unknown" | null | undefined): string {
  if (v === true) return "כן";
  if (v === false) return "לא";
  return "—";
}

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

// ---------------------------------------------------------------------------
// Shared table primitives
// ---------------------------------------------------------------------------

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-right">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-700/60 whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-3 text-slate-700 dark:text-slate-300 align-top border-b border-slate-100 dark:border-zinc-800/50 last:border-b-0 ${className}`}
    >
      {children}
    </td>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-4 mb-1.5">
      {children}
    </div>
  );
}

// Inline source-link button
function SourceButton({
  source,
  onClick,
}: {
  source: SourceRef;
  onClick: (s: SourceRef) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(source)}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-zinc-700/50 bg-slate-50 dark:bg-zinc-800/70 px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-700 transition-colors"
    >
      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
      {source.source_document_name} · עמ׳ {source.page_number}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Corporate Governance — ownership tree + tables
// ---------------------------------------------------------------------------

function CorporateGovernanceSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaCorporateOwnershipAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const holders = anchor?.cap_table?.holders ?? [];
  const shareClasses = anchor?.share_capital?.share_classes ?? [];
  const signatories = anchor?.authorized_signatories ?? [];
  const restrictions = anchor?.transfer_restrictions_and_shareholder_rights?.restrictions ?? [];
  const pledges = restrictions.filter(
    (r) => r.restriction_type === "consent_required" || r.restriction_type === "prohibition",
  );

  return (
    <div className="space-y-5">
      {/* Summary */}
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {/* Ownership Tree (individuals at top → company at bottom) */}
      {holders.length > 0 && (
        <div>
          <SectionLabel>עץ אחזקות</SectionLabel>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            {/* Shareholder row */}
            <div className="flex flex-wrap justify-center gap-2 mb-3">
              {holders.map((h, i) => (
                <div
                  key={i}
                  className={`flex flex-col items-center rounded-xl border px-3 py-2 text-center min-w-[120px] ${
                    h.holder_type === "individual"
                      ? "border-violet-200 bg-violet-50"
                      : "border-sky-200 bg-sky-50"
                  }`}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    {h.holder_type === "individual" ? (
                      <Users className="h-3 w-3 text-violet-500" />
                    ) : (
                      <Building2 className="h-3 w-3 text-sky-500" />
                    )}
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {val(h.holder_name)}
                    </span>
                  </div>
                  {h.ownership_percentage !== "unknown" && (
                    <span className="text-[11px] font-bold text-slate-600">
                      {typeof h.ownership_percentage === "number"
                        ? `${h.ownership_percentage}%`
                        : h.ownership_percentage}
                    </span>
                  )}
                  {val(h.share_class_or_security) !== "—" && (
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      {val(h.share_class_or_security)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {/* Arrow down */}
            <div className="flex justify-center mb-3">
              <div className="flex flex-col items-center gap-0.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-1.5 w-px bg-slate-300" />
                ))}
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </div>
            </div>
            {/* Company box */}
            <div className="flex justify-center">
              <div className="rounded-xl border-2 border-slate-800 bg-slate-800 px-5 py-2.5 text-center">
                <div className="flex items-center gap-2 text-white">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="font-bold text-sm">
                    {val(anchor?.company_identity?.legal_name)}
                  </span>
                </div>
                {val(anchor?.company_identity?.entity_type) !== "—" && (
                  <span className="text-[10px] text-slate-300">
                    {val(anchor?.company_identity?.entity_type)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share capital table */}
      {(shareClasses.length > 0 ||
        val(anchor?.share_capital?.authorized_share_capital) !== "—") && (
        <div>
          <SectionLabel>
            הון מניות
            {val(anchor?.share_capital?.authorized_share_capital) !== "—" && (
              <span className="normal-case text-slate-500 mr-2 text-[10px] font-normal">
                הון רשום:{" "}
                {val(anchor?.share_capital?.authorized_share_capital)} ·
                הון מוקצה:{" "}
                {val(anchor?.share_capital?.issued_share_capital)}
              </span>
            )}
          </SectionLabel>
          {shareClasses.length > 0 ? (
            <TableWrapper>
              <thead>
                <tr>
                  <Th>סוג מניה</Th>
                  <Th>זכויות</Th>
                  <Th>ערך נומינלי</Th>
                  <Th>מוקצה / בתוקף</Th>
                </tr>
              </thead>
              <tbody>
                {shareClasses.map((sc, i) => (
                  <tr key={i}>
                    <Td className="font-medium">{val(sc.share_class)}</Td>
                    <Td>{val(sc.rights_summary)}</Td>
                    <Td>{val(sc.par_value)}</Td>
                    <Td>{val(sc.issued_or_outstanding)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>
          ) : (
            <p className="text-xs text-slate-400 italic">
              פרטי סוגי המניות לא הופיעו במסמכים
            </p>
          )}
        </div>
      )}

      {/* Authorized signatories table */}
      {signatories.length > 0 && (
        <div>
          <SectionLabel>מורשי חתימה</SectionLabel>
          <TableWrapper>
            <thead>
              <tr>
                <Th>שם</Th>
                <Th>תפקיד</Th>
                <Th>כלל חתימה</Th>
                <Th>פרוטוקול / עסקה מאפשרת</Th>
              </tr>
            </thead>
            <tbody>
              {signatories.map((s, i) => (
                <tr key={i}>
                  <Td className="font-medium">{val(s.signatory_name)}</Td>
                  <Td>{val(s.title_or_role)}</Td>
                  <Td>{val(s.signing_rule)}</Td>
                  <Td>{val(s.limitations_or_conditions)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {/* Pledges / liens table (transfer restrictions) */}
      {restrictions.length > 0 && (
        <div>
          <SectionLabel>שעבודים והגבלות העברה</SectionLabel>
          <TableWrapper>
            <thead>
              <tr>
                <Th>סוג</Th>
                <Th>חל על</Th>
                <Th>מי צריך לאשר</Th>
                <Th>אירועי הפעלה</Th>
              </tr>
            </thead>
            <tbody>
              {restrictions.map((r, i) => (
                <tr key={i}>
                  <Td className="font-medium whitespace-nowrap">
                    {val(r.restriction_type)}
                  </Td>
                  <Td>{val(r.applies_to)}</Td>
                  <Td>{val(r.who_must_approve_or_benefits)}</Td>
                  <Td>{val(r.trigger_events)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {/* Findings */}
      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier / Customer shared card layout
// ---------------------------------------------------------------------------

function ContractFieldRow({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="flex gap-2 text-sm py-1.5 border-b border-slate-50 dark:border-zinc-800/50 last:border-0">
      <span className="w-36 shrink-0 text-slate-500 dark:text-slate-400 text-xs font-medium pt-0.5">
        {label}
      </span>
      <span className="flex-1 text-slate-800 dark:text-slate-200 text-xs leading-relaxed">{value}</span>
    </div>
  );
}

function ContractGroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pt-3 pb-1 border-b border-slate-100 dark:border-zinc-700/50 mb-1">
      {children}
    </div>
  );
}

function ExecutionBadge({ status }: { status: "executed" | "not_executed" | "unknown" }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] shrink-0 ${
        status === "executed"
          ? "border-emerald-400 bg-emerald-900/40 text-emerald-300"
          : status === "not_executed"
            ? "border-red-400 bg-red-900/40 text-red-300"
            : "border-slate-500 text-slate-400"
      }`}
    >
      {status === "executed" ? "חתום" : status === "not_executed" ? "לא חתום" : "—"}
    </Badge>
  );
}

function FiveColGroup({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-3 py-3 border-r border-slate-100 dark:border-zinc-700/40 last:border-r-0 min-w-[170px]">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pb-2 mb-2 border-b border-slate-100 dark:border-zinc-700/40">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function FiveColRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="text-[11px]">
      <span className="text-slate-400 dark:text-slate-500">{label}:</span>{" "}
      <span className="text-slate-700 dark:text-slate-300">{value}</span>
    </div>
  );
}

type ContractTableColumn = {
  title: string;
  rows: ({ label: string; value: React.ReactNode } | null)[];
};

function ContractTable({
  accentClass,
  title,
  badge,
  columns,
}: {
  accentClass: string;
  title: string;
  badge: React.ReactNode;
  columns: ContractTableColumn[];
}) {
  const maxRows = Math.max(...columns.map((c) => c.rows.length), 1);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-700/50 overflow-hidden">
      <div className={`${accentClass} px-4 py-2.5 flex items-center justify-between`}>
        <span className="text-white font-semibold text-sm">{title}</span>
        {badge}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-zinc-800/60">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-r border-slate-200 dark:border-zinc-700/50 last:border-r-0 whitespace-nowrap"
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }, (_, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-slate-100 dark:border-zinc-800/50 last:border-b-0 hover:bg-slate-50/50 dark:hover:bg-zinc-800/20 transition-colors"
              >
                {columns.map((col, colIdx) => {
                  const cell = col.rows[rowIdx] ?? null;
                  return (
                    <td
                      key={colIdx}
                      className="px-3 py-2 text-[11px] align-top border-r border-slate-100 dark:border-zinc-800/40 last:border-r-0 min-w-[160px]"
                    >
                      {cell && (
                        <>
                          <span className="text-slate-400 dark:text-slate-500 font-medium">{cell.label}:</span>{" "}
                          <span className="text-slate-700 dark:text-slate-300">{cell.value}</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplierObligationsSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaSupplierAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const supplierName =
    anchor?.contract_profile?.parties?.find((p) => p.role === "supplier")?.name ??
    anchor?.contract_profile?.agreement_title ??
    null;

  const minCommitments = (anchor?.commercial_terms?.minimum_commitments ?? [])
    .map((mc) => `${val(mc.commitment_type)}: ${val(mc.amount_or_volume)}`)
    .join(" · ");

  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {anchor && (
        <ContractTable
          accentClass="bg-slate-800 dark:bg-slate-700"
          title={val(supplierName) !== "—" ? val(supplierName) : "ספק"}
          badge={<ExecutionBadge status={anchor.executed_status} />}
          columns={[
            {
              title: "Supplier & Scope",
              rows: [
                { label: "Supplier Name", value: val(supplierName) },
                { label: "Services", value: val(anchor.contract_profile?.services_or_goods) },
                { label: "Criticality", value: val(anchor.contract_profile?.criticality_indicators) },
              ],
            },
            {
              title: "Financial Commitments",
              rows: [
                {
                  label: "Pricing",
                  value: [
                    val(anchor.commercial_terms?.fees_and_pricing?.fee_amounts_or_rate_card),
                    val(anchor.commercial_terms?.fees_and_pricing?.currency) !== "—"
                      ? `(${val(anchor.commercial_terms?.fees_and_pricing?.currency)})`
                      : "",
                  ].filter(Boolean).join(" "),
                },
                { label: "Payment", value: val(anchor.commercial_terms?.fees_and_pricing?.invoicing_and_payment_terms) },
                { label: "Late Fees", value: val(anchor.commercial_terms?.fees_and_pricing?.late_fees_interest) },
                { label: "Min. Commitments", value: minCommitments || "—" },
                { label: "Price Increase", value: val(anchor.commercial_terms?.price_changes_and_repricing?.notice_period) },
              ],
            },
            {
              title: "Term, Renewal & Termination",
              rows: [
                {
                  label: "Term",
                  value: [
                    val(anchor.term_and_renewal?.initial_term),
                    anchor.term_and_renewal?.auto_renew === true ? "(מתחדש אוטומטית)" : "",
                  ].filter(Boolean).join(" "),
                },
                { label: "Convenience", value: val(anchor.termination_and_continuity?.termination_for_convenience?.notice_period) },
                { label: "Cause", value: (anchor.termination_and_continuity?.termination_for_cause?.grounds ?? []).join(", ") || "—" },
                { label: "Continuity", value: val(anchor.termination_and_continuity?.exit_and_transition?.business_continuity_dr) },
              ],
            },
            {
              title: "CoC & Assignment",
              rows: [
                {
                  label: "CoC",
                  value: [
                    boolLabel(anchor.change_of_control_and_assignment?.change_of_control?.exists),
                    val(anchor.change_of_control_and_assignment?.change_of_control?.effects) !== "—"
                      ? `— ${val(anchor.change_of_control_and_assignment?.change_of_control?.effects)}`
                      : "",
                  ].filter(Boolean).join(" "),
                },
                {
                  label: "Assignment",
                  value: anchor.change_of_control_and_assignment?.assignment?.consent_required === true
                    ? "דורש הסכמה"
                    : anchor.change_of_control_and_assignment?.assignment?.consent_required === false
                      ? "ללא הסכמה"
                      : "—",
                },
              ],
            },
            {
              title: "Governance, Disputes & Gaps",
              rows: [
                {
                  label: "Execution",
                  value: anchor.executed_status === "executed" ? "חתום" : anchor.executed_status === "not_executed" ? "לא חתום" : "—",
                },
                ...(anchor.missing_information ?? []).map((m) => ({ label: "Follow-up", value: m })),
              ],
            },
          ]}
        />
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

function CustomerObligationsSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaCustomerAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const customerName =
    anchor?.contract_profile?.parties?.find((p) => p.role === "customer")?.name ??
    anchor?.contract_profile?.agreement_title ??
    null;

  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {anchor && (
        <ContractTable
          accentClass="bg-indigo-700 dark:bg-indigo-800"
          title={val(customerName) !== "—" ? val(customerName) : "לקוח"}
          badge={<ExecutionBadge status={anchor.executed_status} />}
          columns={[
            {
              title: "Customer & Commercials",
              rows: [
                { label: "Customer", value: val(customerName) },
                {
                  label: "Scope",
                  value: val(
                    anchor.contract_profile?.parties?.find((p) => p.role === "vendor")?.name ??
                    anchor.contract_profile?.agreement_title
                  ),
                },
                {
                  label: "Pricing",
                  value: [
                    val(anchor.commercials?.fees_and_pricing?.fee_amounts_or_rate_card),
                    val(anchor.commercials?.fees_and_pricing?.currency) !== "—"
                      ? `(${val(anchor.commercials?.fees_and_pricing?.currency)})`
                      : "",
                  ].filter(Boolean).join(" "),
                },
                { label: "Payment", value: val(anchor.commercials?.fees_and_pricing?.invoicing_and_payment_terms) },
                { label: "Min. Commitments", value: val(anchor.commercials?.fees_and_pricing?.minimum_commitments) },
                {
                  label: "MFN",
                  value: [
                    boolLabel(anchor.commercials?.mfn_and_benchmarking?.mfn_exists),
                    val(anchor.commercials?.mfn_and_benchmarking?.remedy_if_triggered) !== "—"
                      ? `— ${val(anchor.commercials?.mfn_and_benchmarking?.remedy_if_triggered)}`
                      : "",
                  ].filter(Boolean).join(" "),
                },
              ],
            },
            {
              title: "Service Levels & Commitments",
              rows: [
                {
                  label: "SLA",
                  value: [
                    boolLabel(anchor.sla_and_credits?.sla_exists),
                    val(anchor.sla_and_credits?.sla_summary) !== "—"
                      ? `— ${val(anchor.sla_and_credits?.sla_summary)}`
                      : "",
                  ].filter(Boolean).join(" "),
                },
                {
                  label: "Suspension",
                  value: [
                    boolLabel(anchor.termination_and_suspension?.suspension_rights?.exists),
                    val(anchor.termination_and_suspension?.suspension_rights?.triggers) !== "—"
                      ? `— ${val(anchor.termination_and_suspension?.suspension_rights?.triggers)}`
                      : "",
                  ].filter(Boolean).join(" "),
                },
              ],
            },
            {
              title: "Term, Renewal & Exit",
              rows: [
                { label: "Term", value: val(anchor.term_and_renewal?.initial_term) },
                {
                  label: "Auto-renew Trap",
                  value: anchor.term_and_renewal?.auto_renew === true
                    ? `כן — חלון: ${val(anchor.term_and_renewal?.non_renewal_notice_window)}`
                    : boolLabel(anchor.term_and_renewal?.auto_renew),
                },
                {
                  label: "Termination",
                  value: `נוחות: ${val(anchor.termination_and_suspension?.termination_for_convenience?.notice_period)} | עילה: ${(anchor.termination_and_suspension?.termination_for_cause?.grounds ?? []).join(", ") || "—"}`,
                },
              ],
            },
            {
              title: "CoC & Assignment",
              rows: [
                { label: "CoC Trigger", value: boolLabel(anchor.change_of_control_and_assignment?.change_of_control?.exists) },
                { label: "Consent", value: boolLabel(anchor.change_of_control_and_assignment?.change_of_control?.consent_required) },
                { label: "Termination Right", value: boolLabel(anchor.change_of_control_and_assignment?.change_of_control?.termination_right_triggered) },
                {
                  label: "Assignment",
                  value: anchor.change_of_control_and_assignment?.assignment?.consent_required === true
                    ? "דורש הסכמה"
                    : anchor.change_of_control_and_assignment?.assignment?.consent_required === false
                      ? "ללא הסכמה"
                      : "—",
                },
              ],
            },
            {
              title: "Governance & Missing Docs",
              rows: [
                {
                  label: "Execution",
                  value: anchor.executed_status === "executed" ? "חתום" : anchor.executed_status === "not_executed" ? "לא חתום" : "—",
                },
                ...(anchor.missing_information ?? []).map((m) => ({ label: "Follow-up", value: m })),
              ],
            },
          ]}
        />
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HR — executive summary + key terms table
// ---------------------------------------------------------------------------

function HrSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaHrAggregateAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Executive Summary block */}
      {anchor && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            תמצית מנהלים
          </div>
          {val(anchor.employee_count_statement) !== "—" && (
            <div className="flex gap-2 text-sm">
              <span className="text-slate-500 w-28 shrink-0 text-xs">מצבת עובדים:</span>
              <span className="text-slate-800 dark:text-slate-200 text-xs">{anchor.employee_count_statement}</span>
            </div>
          )}
          {val(anchor.key_risk_summary) !== "—" && (
            <div className="flex gap-2 text-sm">
              <span className="text-slate-500 w-28 shrink-0 text-xs">סיכון מרכזי:</span>
              <span className="text-red-700 text-xs">{anchor.key_risk_summary}</span>
            </div>
          )}
          {val(anchor.legal_exposure_summary) !== "—" && (
            <div className="flex gap-2 text-sm">
              <span className="text-slate-500 w-28 shrink-0 text-xs">חשיפה משפטית:</span>
              <span className="text-amber-700 text-xs">{anchor.legal_exposure_summary}</span>
            </div>
          )}
        </div>
      )}

      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {/* Key terms table */}
      {(anchor?.key_employees ?? []).length > 0 && (
        <div>
          <SectionLabel>ריכוז תנאי העסקה</SectionLabel>
          <TableWrapper>
            <thead>
              <tr>
                <Th>שם העובד</Th>
                <Th>תפקיד</Th>
                <Th>סטטוס חתימה</Th>
                <Th>הודעה מוקדמת</Th>
              </tr>
            </thead>
            <tbody>
              {anchor!.key_employees.map((e, i) => (
                <tr key={i}>
                  <Td className="font-medium">{val(e.employee_name)}</Td>
                  <Td>{val(e.title)}</Td>
                  <Td>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        e.signature_status === "executed"
                          ? "bg-emerald-100 text-emerald-700"
                          : e.signature_status === "not_executed"
                            ? "bg-red-100 text-red-700"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {e.signature_status === "executed"
                        ? "חתום"
                        : e.signature_status === "not_executed"
                          ? "לא חתום"
                          : "—"}
                    </span>
                  </Td>
                  <Td>{val(e.notice_period)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {/* Contractors */}
      {anchor &&
        (anchor.has_independent_contractors === true ||
          val(anchor.contractor_risk_indicators) !== "—") && (
          <div>
            <SectionLabel>ניתוח קבלנים עצמאיים</SectionLabel>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm space-y-1">
              <div className="text-xs font-medium text-amber-800">
                סטטוס:{" "}
                {anchor.has_independent_contractors === true
                  ? "נמצאו הסכמי קבלן במסמכים"
                  : anchor.has_independent_contractors === false
                    ? "לא נמצאו הסכמי קבלן"
                    : "לא ניתן לקבוע"}
              </div>
              {val(anchor.contractor_risk_indicators) !== "—" && (
                <div className="text-xs text-amber-700">
                  אינדיקטורים לסיכון: {anchor.contractor_risk_indicators}
                </div>
              )}
            </div>
          </div>
        )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regulatory — licenses table + compliance plans
// ---------------------------------------------------------------------------

function RegulatorySection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaRegulatoryAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const licenses = anchor?.licenses ?? [];
  const compliancePlans = anchor?.compliance_plans ?? [];

  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {licenses.length > 0 && (
        <div>
          <SectionLabel>א. טבלת רישיונות והיתרים</SectionLabel>
          <TableWrapper>
            <thead>
              <tr>
                <Th>רישיון / היתר</Th>
                <Th>גוף מנפיק</Th>
                <Th>מספר רישיון</Th>
                <Th>תוקף</Th>
                <Th>סטטוס</Th>
                <Th>שינוי שליטה</Th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((lic, i) => (
                <tr key={i}>
                  <Td className="font-medium">{val(lic.license_name)}</Td>
                  <Td>{val(lic.issuing_body)}</Td>
                  <Td>{val(lic.license_number)}</Td>
                  <Td>{val(lic.expiry)}</Td>
                  <Td>{val(lic.status)}</Td>
                  <Td>{boolLabel(lic.change_of_control_approval_required)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {compliancePlans.length > 0 && (
        <div>
          <SectionLabel>ב. ניתוח תוכניות ציות</SectionLabel>
          <div className="space-y-2">
            {compliancePlans.map((cp, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50/50 dark:bg-zinc-800/40 px-4 py-3"
              >
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
                  {val(cp.plan_name)}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{val(cp.description)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Litigation — cases table + settlements
// ---------------------------------------------------------------------------

function LitigationSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaLitigationAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const cases = anchor?.cases ?? [];
  const settlements = anchor?.settlements ?? [];

  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {cases.length > 0 && (
        <div>
          <SectionLabel>הליכים משפטיים</SectionLabel>
          <TableWrapper>
            <thead>
              <tr>
                <Th>תיק / צדדים</Th>
                <Th>סטטוס</Th>
                <Th>מהות התביעה והסעד</Th>
                <Th>חשיפה כספית</Th>
                <Th>הערכת סיכוי</Th>
                <Th>הערות</Th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c, i) => (
                <tr key={i}>
                  <Td className="font-medium max-w-[160px]">
                    {val(c.parties_and_case_id)}
                  </Td>
                  <Td>{val(c.status)}</Td>
                  <Td className="max-w-[200px]">{val(c.nature_and_relief)}</Td>
                  <Td className="whitespace-nowrap">{val(c.estimated_exposure)}</Td>
                  <Td>{val(c.risk_assessment)}</Td>
                  <Td>{val(c.additional_notes)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {settlements.length > 0 && (
        <div>
          <SectionLabel>הסכמי פשרה</SectionLabel>
          <div className="space-y-2">
            {settlements.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50/50 dark:bg-zinc-800/40 px-4 py-3"
              >
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
                  {val(s.case_reference)}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {val(s.settlement_summary)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Taxation — structured entries table
// ---------------------------------------------------------------------------

function TaxationSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaTaxationAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const entries = anchor?.entries ?? [];

  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {entries.length > 0 && (
        <TableWrapper>
          <thead>
            <tr>
              <Th>ישות / נושא</Th>
              <Th>נתונים מרכזיים</Th>
              <Th>סטטוס ותוקף</Th>
              <Th>סיכונים ומשמעויות</Th>
              <Th>השלמות נדרשות</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <Td className="font-medium">{val(e.entity_or_subject)}</Td>
                <Td>{val(e.key_details)}</Td>
                <Td>{val(e.status_and_validity)}</Td>
                <Td>{val(e.risks_and_implications)}</Td>
                <Td>{val(e.gaps_and_follow_ups)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financial Debt — loans table + liens table
// ---------------------------------------------------------------------------

function FinancialDebtSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaFinancialDebtAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const loans = anchor?.loans_and_credit_lines ?? [];
  const liens = anchor?.liens_and_collateral ?? [];

  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {loans.length > 0 && (
        <div>
          <SectionLabel>טבלה 1 — הלוואות וקווי אשראי</SectionLabel>
          <TableWrapper>
            <thead>
              <tr>
                <Th>Lender</Th>
                <Th>Type</Th>
                <Th>קרן ומטבע</Th>
                <Th>ריבית</Th>
                <Th>פירעון</Th>
                <Th>CoC</Th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan, i) => (
                <tr key={i}>
                  <Td className="font-medium">{val(loan.lender)}</Td>
                  <Td>{val(loan.loan_type)}</Td>
                  <Td>{val(loan.principal_and_currency)}</Td>
                  <Td>{val(loan.interest_rate)}</Td>
                  <Td>{val(loan.maturity)}</Td>
                  <Td>{val(loan.coc_consequences)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {liens.length > 0 && (
        <div>
          <SectionLabel>טבלה 2 — שעבודים ובטוחות</SectionLabel>
          <TableWrapper>
            <thead>
              <tr>
                <Th>סוג שעבוד</Th>
                <Th>בטוחה</Th>
                <Th>בעלים רשום</Th>
                <Th>סטטוס</Th>
                <Th>מסמך מקור</Th>
              </tr>
            </thead>
            <tbody>
              {liens.map((lien, i) => (
                <tr key={i}>
                  <Td className="font-medium">{val(lien.lien_type)}</Td>
                  <Td>{val(lien.collateral)}</Td>
                  <Td>{val(lien.registered_owner)}</Td>
                  <Td>{val(lien.status)}</Td>
                  <Td>{val(lien.related_debt_instrument)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insurance — policies summary table
// ---------------------------------------------------------------------------

function InsuranceSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaInsuranceAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const policies = anchor?.policies ?? [];

  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {policies.length > 0 && (
        <div>
          <SectionLabel>ריכוז מערך הביטוח</SectionLabel>
          <TableWrapper>
            <thead>
              <tr>
                <Th>ישות / סוג פוליסה</Th>
                <Th>נתונים מרכזיים</Th>
                <Th>סטטוס ותוקף</Th>
                <Th>סיכונים ומשמעויות</Th>
                <Th>השלמות נדרשות</Th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p, i) => (
                <tr key={i}>
                  <Td className="font-medium whitespace-nowrap">
                    {val(p.entity_and_policy_type)}
                  </Td>
                  <Td>{val(p.key_data)}</Td>
                  <Td>{val(p.status_and_validity)}</Td>
                  <Td>{val(p.risks_and_implications)}</Td>
                  <Td>{val(p.gaps_and_follow_ups)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ESG / Environmental
// ---------------------------------------------------------------------------

function EsgSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaEsgAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const permits = anchor?.environmental_permits_and_requirements_as_stated ?? [];
  const incidents = anchor?.audits_findings_incidents_and_remediation_as_stated ?? [];
  const penalties = anchor?.penalties_and_liabilities_as_stated ?? [];
  const commitments = anchor?.material_esg_commitments_as_stated ?? [];

  return (
    <div className="space-y-5">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {anchor?.document_profile && val(anchor.document_profile.title_or_subject) !== "—" && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50/50 dark:bg-zinc-800/40 px-4 py-3 text-sm space-y-1">
          <div className="flex gap-3 flex-wrap text-xs text-slate-500">
            {val(anchor.document_profile.document_type_detected) !== "—" && <span className="font-medium text-slate-700 dark:text-slate-300">{val(anchor.document_profile.document_type_detected)}</span>}
            {val(anchor.document_profile.authority_or_issuer) !== "—" && <span>· {val(anchor.document_profile.authority_or_issuer)}</span>}
            {val(anchor.document_profile.jurisdiction) !== "—" && <span>· {val(anchor.document_profile.jurisdiction)}</span>}
            {val(anchor.document_profile.document_date) !== "—" && <span>· {val(anchor.document_profile.document_date)}</span>}
          </div>
        </div>
      )}

      {permits.length > 0 && (
        <div>
          <SectionLabel>רישיונות והיתרים סביבתיים</SectionLabel>
          <TableWrapper>
            <thead><tr>
              <Th>רישיון / היתר</Th><Th>מספר</Th><Th>תוקף</Th><Th>תנאים</Th><Th>סטטוס</Th>
            </tr></thead>
            <tbody>
              {permits.map((p, i) => (
                <tr key={i}>
                  <Td className="font-medium">{val(p.permit_name)}</Td>
                  <Td>{val(p.permit_id_or_number)}</Td>
                  <Td>{val(p.expiry_date)}</Td>
                  <Td>{val(p.conditions_or_limits)}</Td>
                  <Td>{val(p.status_as_stated)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {incidents.length > 0 && (
        <div>
          <SectionLabel>ממצאים, אירועים ותיקונים</SectionLabel>
          <div className="space-y-2">
            {incidents.map((inc, i) => (
              <div key={i} className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50/50 dark:bg-zinc-800/40 px-4 py-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{val(inc.event_type)}</span>
                  {val(inc.date_or_period) !== "—" && <span className="text-xs text-slate-400">· {val(inc.date_or_period)}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${inc.status_as_stated === "open" ? "bg-red-100 text-red-700" : inc.status_as_stated === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{val(inc.status_as_stated)}</span>
                </div>
                {val(inc.description) !== "—" && <p className="text-xs text-slate-600 dark:text-slate-300">{val(inc.description)}</p>}
                {val(inc.corrective_actions_or_remediation) !== "—" && <p className="text-xs text-slate-500">תיקון: {val(inc.corrective_actions_or_remediation)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {penalties.length > 0 && (
        <div>
          <SectionLabel>קנסות וחבויות</SectionLabel>
          <TableWrapper>
            <thead><tr><Th>סוג</Th><Th>סכום</Th><Th>עילה</Th><Th>סטטוס תשלום</Th></tr></thead>
            <tbody>
              {penalties.map((p, i) => (
                <tr key={i}>
                  <Td className="font-medium">{val(p.penalty_type)}</Td>
                  <Td>{val(p.amount_as_stated)}</Td>
                  <Td>{val(p.basis_or_reason)}</Td>
                  <Td>{val(p.payment_or_compliance_status_as_stated)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {commitments.length > 0 && (
        <div>
          <SectionLabel>מחויבויות ESG מהותיות</SectionLabel>
          <TableWrapper>
            <thead><tr><Th>סוג</Th><Th>יעד / מחויבות</Th><Th>לוח זמנים</Th><Th>דיווח / בדיקה</Th></tr></thead>
            <tbody>
              {commitments.map((c, i) => (
                <tr key={i}>
                  <Td className="font-medium whitespace-nowrap">{val(c.commitment_type)}</Td>
                  <Td>{val(c.target_or_commitment_text)}</Td>
                  <Td>{val(c.timeline_or_deadline)}</Td>
                  <Td>{val(c.measurement_or_reporting_requirements)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {chapter.findings.length > 0 && <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Physical Assets
// ---------------------------------------------------------------------------

function PhysicalAssetsSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaPhysicalAssetsAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const p = anchor?.property_and_lease_profile;
  const t = anchor?.term_and_renewal;
  const a = anchor?.assignment_subletting_and_consents;
  const etd = anchor?.early_termination_and_default;
  const other = anchor?.other_key_terms_as_stated;

  return (
    <div className="space-y-5">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {anchor && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 overflow-hidden">
          <div className="bg-slate-800 dark:bg-slate-700 px-4 py-2.5 flex items-center justify-between">
            <span className="text-white font-semibold text-sm">{val(p?.property_address) !== "—" ? val(p?.property_address) : val(p?.agreement_title)}</span>
            <ExecutionBadge status={anchor.executed_status} />
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-[680px]">
              <FiveColGroup title="פרטי הנכס והשכירות">
                <FiveColRow label="כתובת" value={val(p?.property_address)} />
                <FiveColRow label="שוכר" value={val(p?.tenant_name)} />
                <FiveColRow label="משכיר" value={val(p?.landlord_name)} />
                <FiveColRow label="שכר דירה" value={val(p?.base_rent)} />
                <FiveColRow label="פיקדון / LC" value={val(p?.security_deposit_or_loc)} />
              </FiveColGroup>
              <FiveColGroup title="תקופה וחידוש">
                <FiveColRow label="תחילה" value={val(t?.commencement_date)} />
                <FiveColRow label="סיום" value={val(t?.expiration_date)} />
                <FiveColRow label="תקופה" value={val(t?.initial_term)} />
                <FiveColRow label="חידוש אוטומטי" value={t?.auto_renew === true ? "כן" : t?.auto_renew === false ? "לא" : "—"} />
                {(t?.renewal_options ?? []).length > 0 && (
                  <FiveColRow label="אופציות" value={(t?.renewal_options ?? []).map(r => `${val(r.renewal_term)} (${val(r.renewal_notice_window)})`).join(", ")} />
                )}
              </FiveColGroup>
              <FiveColGroup title="המחאה ושכירות משנה">
                <FiveColRow label="המחאה מוגבלת" value={a?.assignment_restricted === true ? "כן" : a?.assignment_restricted === false ? "לא" : "—"} />
                <FiveColRow label="שכירות משנה מוגבלת" value={a?.subletting_restricted === true ? "כן" : a?.subletting_restricted === false ? "לא" : "—"} />
                <FiveColRow label="הסכמת משכיר" value={a?.landlord_consent_required === true ? "נדרשת" : a?.landlord_consent_required === false ? "לא נדרשת" : "—"} />
                <FiveColRow label="CoC = המחאה" value={a?.change_of_control_treated_as_assignment === true ? "כן" : a?.change_of_control_treated_as_assignment === false ? "לא" : "—"} />
              </FiveColGroup>
              <FiveColGroup title="סיום מוקדם וכשל">
                {(etd?.early_termination_rights ?? []).map((r, i) => (
                  <FiveColRow key={i} label={`סיום (${val(r.who_can_terminate)})`} value={`${val(r.trigger)} — הודעה: ${val(r.notice_period)}`} />
                ))}
                <FiveColRow label="כשל ותיקון" value={val(etd?.default_and_cure?.cure_periods)} />
              </FiveColGroup>
              <FiveColGroup title="תנאים נוספים">
                <FiveColRow label="שימוש מורשה" value={val(other?.use_restrictions)} />
                <FiveColRow label="ביטוח" value={val(other?.insurance_requirements)} />
                <FiveColRow label="סביבה / חומרים מסוכנים" value={val(other?.environmental_or_hazardous_materials)} />
                {(anchor.missing_information ?? []).length > 0 && (
                  <div className="mt-1 space-y-1">
                    {anchor.missing_information.map((m, i) => (
                      <div key={i} className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-1.5 py-1">{m}</div>
                    ))}
                  </div>
                )}
              </FiveColGroup>
            </div>
          </div>
        </div>
      )}

      {chapter.findings.length > 0 && <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privacy & Cyber
// ---------------------------------------------------------------------------

function PrivacyCyberSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaPrivacyCyberAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  const compliance = anchor?.compliance_statements_as_stated ?? [];
  const incidents = anchor?.incidents_and_breaches_as_stated ?? [];
  const reports = anchor?.assessments_and_reports_as_stated ?? [];
  const regulatory = anchor?.regulatory_actions_and_penalties_as_stated ?? [];
  const dp = anchor?.data_processing_summary_as_stated;
  const sec = anchor?.security_commitments_as_stated;

  return (
    <div className="space-y-5">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {(dp || sec) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {dp && (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50/50 dark:bg-zinc-800/40 px-4 py-3">
              <SectionLabel>עיבוד נתונים ותפקידים</SectionLabel>
              <ContractFieldRow label="תפקידים" value={val(dp.roles_controller_processor)} />
              <ContractFieldRow label="קטגוריות מידע" value={val(dp.categories_of_personal_data)} />
              <ContractFieldRow label="מטרות עיבוד" value={val(dp.processing_purposes)} />
              <ContractFieldRow label="העברות בינ״ל" value={val(dp.international_transfers)} />
              <ContractFieldRow label="שמירה ומחיקה" value={val(dp.retention_and_deletion)} />
            </div>
          )}
          {sec && (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50/50 dark:bg-zinc-800/40 px-4 py-3">
              <SectionLabel>מחויבויות אבטחה</SectionLabel>
              <ContractFieldRow label="אמצעי אבטחה" value={val(sec.security_measures_summary)} />
              <ContractFieldRow label="תקנים / תעודות" value={val(sec.standards_certifications)} />
              <ContractFieldRow label="הצפנה / גישה" value={val(sec.encryption_and_access_controls)} />
              <ContractFieldRow label="ניהול פגיעויות" value={val(sec.vulnerability_management)} />
            </div>
          )}
        </div>
      )}

      {compliance.length > 0 && (
        <div>
          <SectionLabel>ציות לרגולציה</SectionLabel>
          <TableWrapper>
            <thead><tr><Th>מסגרת / חוק</Th><Th>סטטוס</Th><Th>פרטים</Th><Th>תוכנית תיקון</Th></tr></thead>
            <tbody>
              {compliance.map((c, i) => (
                <tr key={i}>
                  <Td className="font-medium whitespace-nowrap">{val(c.framework_or_law)}</Td>
                  <Td>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.statement_type === "compliant" ? "bg-emerald-100 text-emerald-700" : c.statement_type === "non_compliant" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {val(c.statement_type)}
                    </span>
                  </Td>
                  <Td>{val(c.details)}</Td>
                  <Td>{val(c.remediation_plan_or_deadline)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {incidents.length > 0 && (
        <div>
          <SectionLabel>אירועי אבטחה והפרות</SectionLabel>
          <TableWrapper>
            <thead><tr><Th>תאריך</Th><Th>אופי האירוע</Th><Th>מה נפגע</Th><Th>הודעות</Th><Th>קנסות</Th><Th>סטטוס</Th></tr></thead>
            <tbody>
              {incidents.map((inc, i) => (
                <tr key={i}>
                  <Td className="whitespace-nowrap">{val(inc.incident_date_or_period)}</Td>
                  <Td>{val(inc.nature_of_incident)}</Td>
                  <Td>{val(inc.systems_or_data_impacted)}</Td>
                  <Td>{val(inc.notifications_made)}</Td>
                  <Td>{val(inc.fines_penalties_or_claims_as_stated)}</Td>
                  <Td>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${inc.status_as_stated === "closed" ? "bg-emerald-100 text-emerald-700" : inc.status_as_stated === "open" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                      {val(inc.status_as_stated)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {reports.length > 0 && (
        <div>
          <SectionLabel>דוחות הערכה (Pen Test / SOC2 / ISO)</SectionLabel>
          <TableWrapper>
            <thead><tr><Th>סוג</Th><Th>תאריך</Th><Th>היקף</Th><Th>ממצאים קריטיים</Th><Th>סטטוס תיקון</Th></tr></thead>
            <tbody>
              {reports.map((r, i) => (
                <tr key={i}>
                  <Td className="font-medium">{val(r.report_type)}</Td>
                  <Td>{val(r.report_date)}</Td>
                  <Td>{val(r.scope)}</Td>
                  <Td>{val(r.critical_findings_as_stated)}</Td>
                  <Td>{val(r.remediation_status_as_stated)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {regulatory.length > 0 && (
        <div>
          <SectionLabel>פעולות רגולטוריות וקנסות</SectionLabel>
          <TableWrapper>
            <thead><tr><Th>רשות</Th><Th>סוג</Th><Th>פרטים</Th><Th>קנס</Th><Th>סטטוס</Th></tr></thead>
            <tbody>
              {regulatory.map((r, i) => (
                <tr key={i}>
                  <Td className="font-medium">{val(r.authority)}</Td>
                  <Td>{val(r.action_type)}</Td>
                  <Td>{val(r.details)}</Td>
                  <Td>{val(r.penalty_amount_as_stated)}</Td>
                  <Td>{val(r.status_as_stated)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </div>
      )}

      {chapter.findings.length > 0 && <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intellectual Property (IP)
// ---------------------------------------------------------------------------

function IpSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaIpAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  return (
    <div className="space-y-5">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {anchor && (anchor.ip_assets ?? []).length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 overflow-hidden">
          <div className="bg-slate-800 dark:bg-slate-700 px-4 py-2.5">
            <span className="text-white font-semibold text-sm">נכסי קניין רוחני</span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-[680px]">
              <FiveColGroup title="סוג הנכס">
                {(anchor.ip_assets ?? []).map((a, i) => (
                  <FiveColRow key={i} label={a.ip_type} value={val(a.asset_name_or_title)} />
                ))}
              </FiveColGroup>
              <FiveColGroup title="מזהה / מספר">
                {(anchor.ip_assets ?? []).map((a, i) => (
                  <FiveColRow key={i} label="" value={val(a.identifier_numbers)} />
                ))}
              </FiveColGroup>
              <FiveColGroup title="תחום שיפוט">
                {(anchor.ip_assets ?? []).map((a, i) => (
                  <FiveColRow key={i} label="" value={val(a.jurisdiction)} />
                ))}
              </FiveColGroup>
              <FiveColGroup title="שרשרת בעלות">
                <FiveColRow label="שפה" value={val(anchor.chain_of_title?.assignment_language_type)} />
                <FiveColRow label="WFH" value={anchor.chain_of_title?.works_made_for_hire_language === true ? "כן" : anchor.chain_of_title?.works_made_for_hire_language === false ? "לא" : "—"} />
                <FiveColRow label="further assurances" value={anchor.chain_of_title?.further_assurances_obligation === true ? "כן" : anchor.chain_of_title?.further_assurances_obligation === false ? "לא" : "—"} />
              </FiveColGroup>
              <FiveColGroup title="OSS ומחלוקות">
                {(anchor.oss_components ?? []).map((c, i) => (
                  <FiveColRow key={i} label={c.component_name} value={c.license_names_as_listed?.join(", ") ?? "—"} />
                ))}
                {(anchor.ip_disputes_and_claims ?? []).map((d, i) => (
                  <FiveColRow key={i} label={`מחלוקת: ${d.dispute_type}`} value={val(d.status_as_stated)} />
                ))}
              </FiveColGroup>
            </div>
          </div>
        </div>
      )}

      {chapter.findings.length > 0 && <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intangible Assets
// ---------------------------------------------------------------------------

function IntangibleAssetsSection({
  chapter,
  anchor,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  anchor: MaIntangibleAssetsAnchor | null;
  onOpenSource: (s: SourceRef) => void;
}) {
  return (
    <div className="space-y-5">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {anchor && (anchor.assets ?? []).length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 overflow-hidden">
          <div className="bg-slate-800 dark:bg-slate-700 px-4 py-2.5">
            <span className="text-white font-semibold text-sm">נכסים בלתי מוחשיים</span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-[680px]">
              <FiveColGroup title="סוג הנכס">
                {(anchor.assets ?? []).map((a, i) => (
                  <FiveColRow key={i} label={a.asset_type} value={val(a.description)} />
                ))}
              </FiveColGroup>
              <FiveColGroup title="הגנות וסודיות">
                {(anchor.assets ?? []).map((a, i) => (
                  <FiveColRow key={i} label="" value={val(a.protection_measures)} />
                ))}
              </FiveColGroup>
              <FiveColGroup title="חובות סודיות">
                {(anchor.assets ?? []).map((a, i) => (
                  <FiveColRow key={i} label="" value={val(a.confidentiality_obligations)} />
                ))}
              </FiveColGroup>
              <FiveColGroup title="החזרה / השמדה">
                {(anchor.assets ?? []).map((a, i) => (
                  <FiveColRow key={i} label="" value={val(a.return_or_destruction_obligations)} />
                ))}
              </FiveColGroup>
              <FiveColGroup title="הגבלות גישה / פערים">
                {(anchor.assets ?? []).map((a, i) => (
                  <FiveColRow key={i} label="" value={val(a.access_restrictions)} />
                ))}
                {(anchor.gaps_and_unknowns ?? []).map((g, i) => (
                  <div key={i} className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-1.5 py-1 mt-1">{g}</div>
                ))}
              </FiveColGroup>
            </div>
          </div>
        </div>
      )}

      {chapter.findings.length > 0 && <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic chapter section (for chapters without custom renderers)
// ---------------------------------------------------------------------------

function GenericChapterBody({
  chapter,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  onOpenSource: (s: SourceRef) => void;
}) {
  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}
      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Findings list
// ---------------------------------------------------------------------------

function FindingSeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical")
    return <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />;
  if (severity === "warning")
    return <Shield className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />;
  return <Info className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />;
}

function FindingsList({
  findings,
  onOpenSource,
}: {
  findings: MaFinding[];
  onOpenSource: (src: SourceRef) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        ממצאים ({findings.length})
      </div>
      <div className="rounded-xl border border-slate-100 dark:border-zinc-800/50 overflow-hidden">
        {findings.map((f, idx) => {
          const isOpen = expanded.has(f.id);
          const severityStripe =
            f.severity === "critical"
              ? "bg-red-400 dark:bg-red-500"
              : f.severity === "warning"
                ? "bg-amber-400 dark:bg-amber-500"
                : "bg-slate-300 dark:bg-zinc-600";
          const rowBg = idx % 2 === 0
            ? "bg-white dark:bg-zinc-900/60"
            : "bg-slate-50/70 dark:bg-zinc-800/30";

          return (
            <div
              key={f.id}
              className={`${rowBg} ${idx > 0 ? "border-t border-slate-100 dark:border-zinc-800/50" : ""}`}
            >
              <button
                onClick={() => toggle(f.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-right hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
              >
                <div className={`w-1 self-stretch rounded-full shrink-0 ${severityStripe}`} />
                <FindingSeverityIcon severity={f.severity} />
                <span className="flex-1 font-medium text-[13px] text-slate-800 dark:text-slate-100 leading-snug">
                  {f.title}
                </span>
                {f.sources && f.sources.length > 0 && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                    {f.sources.length} מקורות
                  </span>
                )}
                <svg
                  className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="px-4 pb-3 pt-1 border-t border-slate-100/70 dark:border-zinc-800/40">
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {f.description}
                  </p>
                  {f.sources && f.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {f.sources.map((s, sidx) => (
                        <SourceButton key={sidx} source={s} onClick={onOpenSource} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow-ups list
// ---------------------------------------------------------------------------

function FollowUpsList({ followUps }: { followUps: MaFollowUp[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        השלמות נדרשות ({followUps.length})
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
                {fu.suggested_document && (
                  <div className="mt-1 text-xs opacity-70">
                    מסמך מוצע: {fu.suggested_document}
                  </div>
                )}
              </div>
              <Badge
                variant="outline"
                className={`shrink-0 text-[10px] ${SEVERITY_BADGE_CLASSES[fu.severity] || ""}`}
              >
                {SEVERITY_LABELS[fu.severity] || fu.severity}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chapter accordion wrapper
// ---------------------------------------------------------------------------

function ChapterAccordion({
  chapter,
  anchor,
  defaultOpen = false,
  onOpenSource,
}: {
  chapter: MaChapterOutput;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anchor: any;
  defaultOpen?: boolean;
  onOpenSource: (s: SourceRef) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const criticalCount = chapter.findings.filter(
    (f) => f.severity === "critical",
  ).length;
  const warningCount = chapter.findings.filter(
    (f) => f.severity === "warning",
  ).length;

  function renderBody() {
    if (chapter.empty_state) {
      return (
        <div className="text-sm text-slate-400 italic px-1">
          לא נמצאו מסמכים רלוונטיים לפרק זה
        </div>
      );
    }
    switch (chapter.chapter_id) {
      case "corporate_governance":
        return (
          <CorporateGovernanceSection
            chapter={chapter}
            anchor={anchor as MaCorporateOwnershipAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "customer_obligations":
        return (
          <CustomerObligationsSection
            chapter={chapter}
            anchor={anchor as MaCustomerAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "supplier_obligations":
        return (
          <SupplierObligationsSection
            chapter={chapter}
            anchor={anchor as MaSupplierAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "hr":
        return (
          <HrSection
            chapter={chapter}
            anchor={anchor as MaHrAggregateAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "regulatory":
        return (
          <RegulatorySection
            chapter={chapter}
            anchor={anchor as MaRegulatoryAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "litigation":
        return (
          <LitigationSection
            chapter={chapter}
            anchor={anchor as MaLitigationAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "taxation":
        return (
          <TaxationSection
            chapter={chapter}
            anchor={anchor as MaTaxationAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "financial_debt":
        return (
          <FinancialDebtSection
            chapter={chapter}
            anchor={anchor as MaFinancialDebtAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "insurance":
        return (
          <InsuranceSection
            chapter={chapter}
            anchor={anchor as MaInsuranceAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "intellectual_property":
        return (
          <IpSection
            chapter={chapter}
            anchor={anchor as MaIpAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "physical_assets":
        return (
          <PhysicalAssetsSection
            chapter={chapter}
            anchor={anchor as MaPhysicalAssetsAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "privacy_and_cyber":
        return (
          <PrivacyCyberSection
            chapter={chapter}
            anchor={anchor as MaPrivacyCyberAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "esg_environmental":
        return (
          <EsgSection
            chapter={chapter}
            anchor={anchor as MaEsgAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      case "intangible_assets":
        return (
          <IntangibleAssetsSection
            chapter={chapter}
            anchor={anchor as MaIntangibleAssetsAnchor | null}
            onOpenSource={onOpenSource}
          />
        );
      default:
        return (
          <GenericChapterBody chapter={chapter} onOpenSource={onOpenSource} />
        );
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-2xl border border-slate-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/80 overflow-hidden"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-right hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronRight
            className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
            {chapter.chapter_title_he}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {chapter.empty_state ? (
            <Badge variant="outline" className="text-[10px] text-slate-400">
              אין מסמכים
            </Badge>
          ) : (
            <>
              {criticalCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-red-300 bg-red-50 text-red-700"
                >
                  {criticalCount} קריטי
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-300 bg-amber-50 text-amber-700"
                >
                  {warningCount} אזהרה
                </Badge>
              )}
              {chapter.follow_ups.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-slate-300 text-slate-500"
                >
                  {chapter.follow_ups.length} השלמות
                </Badge>
              )}
              {criticalCount === 0 &&
                warningCount === 0 &&
                chapter.follow_ups.length === 0 &&
                chapter.findings.length > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-slate-300 text-slate-500"
                  >
                    {chapter.findings.length} ממצאים
                  </Badge>
                )}
            </>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-slate-100 dark:border-zinc-700/50 px-4 py-4">{renderBody()}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Props + main component
// ---------------------------------------------------------------------------

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
  const anchors = report.anchor_extractions ?? {};

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
      const url = await api.getFileBlobUrl(projectId, fileId);
      urlCacheRef.current.set(cacheKey, { url, at: Date.now() });
      setCitationUrl(url);
    } catch {
      setCitationUrl(null);
    } finally {
      setCitationLoading(false);
    }
  }

  const completeness = report.completeness;
  const riskLevel = report.executive_summary?.risk_level;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── Header card ─────────────────────────────────────────── */}
      <Card className="rounded-2xl bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-100 dark:border-zinc-700/50">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-xl text-slate-900 dark:text-slate-100">
                {header?.project_name || projectTitle}
              </CardTitle>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                {header?.client_name && (
                  <span>לקוח: <strong className="text-slate-700 dark:text-slate-200">{header.client_name}</strong></span>
                )}
                {header?.representing_role && (
                  <span>מייצגים: <strong className="text-slate-700 dark:text-slate-200">{header.representing_role}</strong></span>
                )}
                {header?.counterparty_name && (
                  <span>צד שכנגד: <strong className="text-slate-700 dark:text-slate-200">{header.counterparty_name}</strong></span>
                )}
                {typeof header?.doc_count === "number" && (
                  <span>{header.doc_count} מסמכים</span>
                )}
              </div>
            </div>
            {riskLevel && (
              <Badge
                variant="outline"
                className={`text-sm px-3 py-1.5 shrink-0 ${
                  riskLevel === "high"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : riskLevel === "medium"
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-emerald-300 bg-emerald-50 text-emerald-700"
                }`}
              >
                {riskLevel === "high"
                  ? "סיכון גבוה"
                  : riskLevel === "medium"
                    ? "סיכון בינוני"
                    : "סיכון נמוך"}
              </Badge>
            )}
          </div>
        </CardHeader>

        {chaptersById.get("transaction_overview")?.summary_he && (
          <CardContent className="pt-0">
            <div className="rounded-xl border border-slate-100 dark:border-zinc-700/50 bg-slate-50/60 dark:bg-zinc-800/40 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                <Info className="h-3.5 w-3.5" />
                תמצית מנהלים
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {chaptersById.get("transaction_overview")!.summary_he}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Risk summary row (critical/warning counts) ─────────── */}
      {(() => {
        const allFindings = (report.chapters || []).flatMap((c) => c.findings);
        const critTotal = allFindings.filter((f) => f.severity === "critical").length;
        const warnTotal = allFindings.filter((f) => f.severity === "warning").length;
        const followTotal = (report.chapters || []).reduce(
          (s, c) => s + c.follow_ups.length,
          0,
        );
        if (critTotal + warnTotal + followTotal === 0) return null;
        return (
          <div className="flex flex-wrap gap-2 px-1">
            {critTotal > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
                <span className="font-bold text-red-700 dark:text-red-300">{critTotal}</span>
                <span className="text-red-600 dark:text-red-400">ממצאים קריטיים</span>
              </div>
            )}
            {warnTotal > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
                <Shield className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                <span className="font-bold text-amber-700 dark:text-amber-300">{warnTotal}</span>
                <span className="text-amber-600 dark:text-amber-400">אזהרות</span>
              </div>
            )}
            {followTotal > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-700/50 bg-slate-50 dark:bg-zinc-800/70 px-3 py-2 text-sm">
                <Info className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <span className="font-bold text-slate-600 dark:text-slate-300">{followTotal}</span>
                <span className="text-slate-500 dark:text-slate-400">השלמות נדרשות</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Chapter accordions ──────────────────────────────────── */}
      <div className="space-y-2">
        {CHAPTER_ORDER.map((id) => {
          const chapter = chaptersById.get(id);
          if (!chapter) return null;
          const anchor = anchors[id] ?? null;
          // transaction_overview collapses by default (content is in executive summary above)
          const defaultOpen = id !== "transaction_overview";
          return (
            <ChapterAccordion
              key={id}
              chapter={chapter}
              anchor={anchor}
              defaultOpen={defaultOpen}
              onOpenSource={openCitation}
            />
          );
        })}
      </div>


      {/* ── PDF citation dialog ─────────────────────────────────── */}
      <Dialog open={citationOpen} onOpenChange={setCitationOpen}>
        <DialogContent className="left-4 right-4 bottom-4 top-16 sm:left-6 sm:right-6 lg:left-10 lg:right-10 flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-none">
          <DialogHeader className="border-b p-4">
            <DialogTitle className="text-right text-sm font-semibold">
              {citationTitle || "ציטוט מהמסמך"}
            </DialogTitle>
          </DialogHeader>
          {citationQuote && (
            <div className="border-b bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-right text-sm text-amber-900 dark:text-amber-100">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                ציטוט
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">
                {citationQuote}
              </div>
            </div>
          )}
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
