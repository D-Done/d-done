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
  "transaction_overview",
  "corporate_governance",
  "customer_obligations",
  "supplier_obligations",
  "channel_reseller_partner",
  "hr",
  "regulatory",
  "litigation",
  "taxation",
  "financial_debt",
  "insurance",
  "technology_product",
  "ip_ownership",
  "ip_licensing",
  "oss",
];

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-slate-50 text-slate-600 border-slate-200",
};

const SEVERITY_BADGE_CLASSES: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-red-700",
  warning: "border-amber-300 bg-amber-50 text-amber-700",
  info: "border-slate-300 bg-slate-50 text-slate-600",
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
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm text-right">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 whitespace-nowrap">
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
      className={`px-3 py-2.5 text-slate-700 align-top border-b border-slate-100 last:border-b-0 ${className}`}
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
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 hover:border-slate-300 hover:bg-white transition-colors"
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
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
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
                    <span className="text-xs font-semibold text-slate-800">
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
                <Th>הגבלות / עסקה</Th>
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

      {/* Follow-ups */}
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
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
    <div className="flex gap-2 text-sm py-1.5 border-b border-slate-50 last:border-0">
      <span className="w-36 shrink-0 text-slate-500 text-xs font-medium pt-0.5">
        {label}
      </span>
      <span className="flex-1 text-slate-800 text-xs leading-relaxed">{value}</span>
    </div>
  );
}

function ContractGroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-3 pb-1 border-b border-slate-100 mb-1">
      {children}
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
    anchor?.contract_profile?.parties?.find((p) => p.role === "supplier")
      ?.name ??
    anchor?.contract_profile?.agreement_title ??
    null;

  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {anchor && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Card header */}
          <div className="bg-slate-800 px-4 py-2.5 flex items-center justify-between">
            <span className="text-white font-semibold text-sm">
              {val(supplierName) !== "—" ? val(supplierName) : "ספק"}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 ${
                anchor.executed_status === "executed"
                  ? "border-emerald-400 bg-emerald-900/40 text-emerald-300"
                  : anchor.executed_status === "not_executed"
                    ? "border-red-400 bg-red-900/40 text-red-300"
                    : "border-slate-500 text-slate-400"
              }`}
            >
              {anchor.executed_status === "executed"
                ? "חתום"
                : anchor.executed_status === "not_executed"
                  ? "לא חתום"
                  : "—"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* Left column */}
            <div className="px-4 py-3">
              <ContractGroupHeader>Supplier &amp; Scope</ContractGroupHeader>
              <ContractFieldRow
                label="Supplier Name"
                value={val(supplierName)}
              />
              <ContractFieldRow
                label="Services"
                value={val(anchor.contract_profile?.services_or_goods)}
              />
              <ContractFieldRow
                label="Criticality"
                value={val(anchor.contract_profile?.criticality_indicators)}
              />
              <ContractGroupHeader>Financial Commitments</ContractGroupHeader>
              <ContractFieldRow
                label="Pricing"
                value={`${val(anchor.commercial_terms?.fees_and_pricing?.fee_amounts_or_rate_card)} ${val(anchor.commercial_terms?.fees_and_pricing?.currency) !== "—" ? `(${val(anchor.commercial_terms?.fees_and_pricing?.currency)})` : ""}`.trim()}
              />
              <ContractFieldRow
                label="Payment"
                value={val(
                  anchor.commercial_terms?.fees_and_pricing
                    ?.invoicing_and_payment_terms,
                )}
              />
              <ContractFieldRow
                label="Late Fees"
                value={val(
                  anchor.commercial_terms?.fees_and_pricing?.late_fees_interest,
                )}
              />
              {(anchor.commercial_terms?.minimum_commitments ?? []).length >
                0 && (
                <ContractFieldRow
                  label="Min. Commitments"
                  value={anchor.commercial_terms!.minimum_commitments
                    .map(
                      (mc) =>
                        `${val(mc.commitment_type)}: ${val(mc.amount_or_volume)}`,
                    )
                    .join(" · ")}
                />
              )}
              <ContractFieldRow
                label="Price Increase"
                value={val(
                  anchor.commercial_terms?.price_changes_and_repricing
                    ?.notice_period,
                )}
              />
            </div>

            {/* Right column */}
            <div className="px-4 py-3">
              <ContractGroupHeader>Term, Renewal &amp; Termination</ContractGroupHeader>
              <ContractFieldRow
                label="Term"
                value={`${val(anchor.term_and_renewal?.initial_term)} ${anchor.term_and_renewal?.auto_renew === true ? "(מתחדש אוטומטית)" : ""}`.trim()}
              />
              <ContractFieldRow
                label="Convenience"
                value={val(
                  anchor.termination_and_continuity?.termination_for_convenience
                    ?.notice_period,
                )}
              />
              <ContractFieldRow
                label="Cause"
                value={
                  (anchor.termination_and_continuity?.termination_for_cause?.grounds ?? []).length > 0
                    ? anchor.termination_and_continuity!.termination_for_cause.grounds.join(", ")
                    : "—"
                }
              />
              <ContractGroupHeader>CoC &amp; Assignment</ContractGroupHeader>
              <ContractFieldRow
                label="CoC"
                value={`${boolLabel(anchor.change_of_control_and_assignment?.change_of_control?.exists)} ${val(anchor.change_of_control_and_assignment?.change_of_control?.effects) !== "—" ? `— ${val(anchor.change_of_control_and_assignment?.change_of_control?.effects)}` : ""}`.trim()}
              />
              <ContractFieldRow
                label="Assignment"
                value={
                  anchor.change_of_control_and_assignment?.assignment
                    ?.consent_required === true
                    ? "דורש הסכמה"
                    : anchor.change_of_control_and_assignment?.assignment
                          ?.consent_required === false
                      ? "ללא הסכמה"
                      : "—"
                }
              />
              <ContractFieldRow
                label="Continuity"
                value={val(
                  anchor.termination_and_continuity?.exit_and_transition
                    ?.business_continuity_dr,
                )}
              />
              {anchor.missing_information?.length > 0 && (
                <>
                  <ContractGroupHeader>Follow-ups</ContractGroupHeader>
                  {anchor.missing_information.map((m, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mb-1"
                    >
                      {m}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
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
    anchor?.contract_profile?.parties?.find((p) => p.role === "customer")
      ?.name ??
    anchor?.contract_profile?.agreement_title ??
    null;

  return (
    <div className="space-y-4">
      {chapter.summary_he && (
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}

      {anchor && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="bg-indigo-700 px-4 py-2.5 flex items-center justify-between">
            <span className="text-white font-semibold text-sm">
              {val(customerName) !== "—" ? val(customerName) : "לקוח"}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 ${
                anchor.executed_status === "executed"
                  ? "border-emerald-400 bg-emerald-900/40 text-emerald-300"
                  : anchor.executed_status === "not_executed"
                    ? "border-red-400 bg-red-900/40 text-red-300"
                    : "border-indigo-400 text-indigo-200"
              }`}
            >
              {anchor.executed_status === "executed"
                ? "חתום"
                : anchor.executed_status === "not_executed"
                  ? "לא חתום"
                  : "—"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            <div className="px-4 py-3">
              <ContractGroupHeader>Customer &amp; Commercials</ContractGroupHeader>
              <ContractFieldRow label="Customer" value={val(customerName)} />
              <ContractFieldRow
                label="Scope"
                value={val(anchor.contract_profile?.parties?.find(p => p.role === "vendor")?.name ?? anchor.contract_profile?.agreement_title)}
              />
              <ContractFieldRow
                label="Pricing"
                value={`${val(anchor.commercials?.fees_and_pricing?.fee_amounts_or_rate_card)} ${val(anchor.commercials?.fees_and_pricing?.currency) !== "—" ? `(${val(anchor.commercials?.fees_and_pricing?.currency)})` : ""}`.trim()}
              />
              <ContractFieldRow
                label="Payment"
                value={val(
                  anchor.commercials?.fees_and_pricing
                    ?.invoicing_and_payment_terms,
                )}
              />
              <ContractFieldRow
                label="Min. Commitments"
                value={val(
                  anchor.commercials?.fees_and_pricing?.minimum_commitments,
                )}
              />
              <ContractFieldRow
                label="MFN"
                value={`${boolLabel(anchor.commercials?.mfn_and_benchmarking?.mfn_exists)} ${val(anchor.commercials?.mfn_and_benchmarking?.remedy_if_triggered) !== "—" ? `— ${val(anchor.commercials?.mfn_and_benchmarking?.remedy_if_triggered)}` : ""}`.trim()}
              />
              <ContractGroupHeader>Service Levels &amp; Commitments</ContractGroupHeader>
              <ContractFieldRow
                label="SLA"
                value={`${boolLabel(anchor.sla_and_credits?.sla_exists)} ${val(anchor.sla_and_credits?.sla_summary) !== "—" ? `— ${val(anchor.sla_and_credits?.sla_summary)}` : ""}`.trim()}
              />
              <ContractFieldRow
                label="Suspension"
                value={`${boolLabel(anchor.termination_and_suspension?.suspension_rights?.exists)} ${val(anchor.termination_and_suspension?.suspension_rights?.triggers) !== "—" ? `— ${val(anchor.termination_and_suspension?.suspension_rights?.triggers)}` : ""}`.trim()}
              />
            </div>

            <div className="px-4 py-3">
              <ContractGroupHeader>Term, Renewal &amp; Exit</ContractGroupHeader>
              <ContractFieldRow
                label="Term"
                value={val(anchor.term_and_renewal?.initial_term)}
              />
              <ContractFieldRow
                label="Auto-renew Trap"
                value={
                  anchor.term_and_renewal?.auto_renew === true
                    ? `כן — חלון: ${val(anchor.term_and_renewal?.non_renewal_notice_window)}`
                    : boolLabel(anchor.term_and_renewal?.auto_renew)
                }
              />
              <ContractFieldRow
                label="Termination"
                value={`נוחות: ${val(anchor.termination_and_suspension?.termination_for_convenience?.notice_period)} | עילה: ${(anchor.termination_and_suspension?.termination_for_cause?.grounds ?? []).join(", ") || "—"}`}
              />
              <ContractGroupHeader>CoC &amp; Assignment</ContractGroupHeader>
              <ContractFieldRow
                label="CoC Trigger"
                value={boolLabel(
                  anchor.change_of_control_and_assignment?.change_of_control
                    ?.exists,
                )}
              />
              <ContractFieldRow
                label="Consent"
                value={boolLabel(
                  anchor.change_of_control_and_assignment?.change_of_control
                    ?.consent_required,
                )}
              />
              <ContractFieldRow
                label="Termination Right"
                value={boolLabel(
                  anchor.change_of_control_and_assignment?.change_of_control
                    ?.termination_right_triggered,
                )}
              />
              <ContractFieldRow
                label="Assignment"
                value={
                  anchor.change_of_control_and_assignment?.assignment
                    ?.consent_required === true
                    ? "דורש הסכמה"
                    : anchor.change_of_control_and_assignment?.assignment
                          ?.consent_required === false
                      ? "ללא הסכמה"
                      : "—"
                }
              />
              {anchor.missing_information?.length > 0 && (
                <>
                  <ContractGroupHeader>
                    Governance &amp; Missing Docs
                  </ContractGroupHeader>
                  {anchor.missing_information.map((m, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mb-1"
                    >
                      {m}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
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
              <span className="text-slate-800 text-xs">{anchor.employee_count_statement}</span>
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
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
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
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
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
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
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
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3"
              >
                <div className="text-sm font-semibold text-slate-800 mb-1">
                  {val(cp.plan_name)}
                </div>
                <div className="text-xs text-slate-600">{val(cp.description)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
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
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
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
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3"
              >
                <div className="text-sm font-semibold text-slate-800 mb-1">
                  {val(s.case_reference)}
                </div>
                <div className="text-xs text-slate-600">
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
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
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
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
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
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
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
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
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
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
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
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
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
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
      )}
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
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
          {chapter.summary_he}
        </p>
      )}
      {chapter.findings.length > 0 && (
        <FindingsList findings={chapter.findings} onOpenSource={onOpenSource} />
      )}
      {chapter.follow_ups.length > 0 && (
        <FollowUpsList followUps={chapter.follow_ups} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Findings list
// ---------------------------------------------------------------------------

function FindingsList({
  findings,
  onOpenSource,
}: {
  findings: MaFinding[];
  onOpenSource: (src: SourceRef) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        ממצאים ({findings.length})
      </div>
      <ul className="space-y-2">
        {findings.map((f) => (
          <li
            key={f.id}
            className={`rounded-xl border p-3 ${SEVERITY_CLASSES[f.severity] || ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className="text-[10px] border-current/30"
                  >
                    {f.subsection}
                  </Badge>
                  <span className="font-semibold text-sm">{f.title}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{f.description}</p>
                {f.sources && f.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {f.sources.map((s, idx) => (
                      <SourceButton key={idx} source={s} onClick={onOpenSource} />
                    ))}
                  </div>
                )}
              </div>
              <Badge
                variant="outline"
                className={`shrink-0 text-[10px] ${SEVERITY_BADGE_CLASSES[f.severity] || ""}`}
              >
                {SEVERITY_LABELS[f.severity] || f.severity}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
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
      className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-right hover:bg-slate-50/80 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronRight
            className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="font-semibold text-slate-800 text-sm">
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
        <div className="border-t border-slate-100 px-4 py-4">{renderBody()}</div>
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
  const riskLevel = report.executive_summary?.risk_level;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── Header card ─────────────────────────────────────────── */}
      <Card className="rounded-2xl bg-white shadow-sm border border-slate-100">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-xl text-slate-900">
                {header?.project_name || projectTitle}
              </CardTitle>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                {header?.client_name && (
                  <span>לקוח: <strong className="text-slate-700">{header.client_name}</strong></span>
                )}
                {header?.representing_role && (
                  <span>מייצגים: <strong className="text-slate-700">{header.representing_role}</strong></span>
                )}
                {header?.counterparty_name && (
                  <span>צד שכנגד: <strong className="text-slate-700">{header.counterparty_name}</strong></span>
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

        {report.executive_summary?.summary && (
          <CardContent className="pt-0">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                <Info className="h-3.5 w-3.5" />
                תמצית מנהלים
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {report.executive_summary.summary}
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
              <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="font-bold text-red-700">{critTotal}</span>
                <span className="text-red-600">ממצאים קריטיים</span>
              </div>
            )}
            {warnTotal > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <Shield className="h-4 w-4 text-amber-500" />
                <span className="font-bold text-amber-700">{warnTotal}</span>
                <span className="text-amber-600">אזהרות</span>
              </div>
            )}
            {followTotal > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <Info className="h-4 w-4 text-slate-400" />
                <span className="font-bold text-slate-600">{followTotal}</span>
                <span className="text-slate-500">השלמות נדרשות</span>
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

      {/* ── Completeness checklist ──────────────────────────────── */}
      {completeness && completeness.items.length > 0 && (
        <Card className="rounded-2xl bg-white shadow-sm border border-slate-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              השלמות נדרשות ({completeness.items.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {completeness.summary_he && (
              <p className="text-sm text-slate-600 mb-3">{completeness.summary_he}</p>
            )}
            <ul className="space-y-2">
              {completeness.items.map((it) => (
                <li
                  key={it.id}
                  className={`rounded-xl border p-3 ${SEVERITY_CLASSES[it.severity] || ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{it.description}</div>
                      {it.suggested_document && (
                        <div className="mt-1 text-xs opacity-70">
                          מסמך מוצע: {it.suggested_document}
                        </div>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] ${SEVERITY_BADGE_CLASSES[it.severity] || ""}`}
                    >
                      {SEVERITY_LABELS[it.severity] || it.severity}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── PDF citation dialog ─────────────────────────────────── */}
      <Dialog open={citationOpen} onOpenChange={setCitationOpen}>
        <DialogContent className="left-4 right-4 bottom-4 top-16 sm:left-6 sm:right-6 lg:left-10 lg:right-10 flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-none">
          <DialogHeader className="border-b p-4">
            <DialogTitle className="text-right text-sm font-semibold">
              {citationTitle || "ציטוט מהמסמך"}
            </DialogTitle>
          </DialogHeader>
          {citationQuote && (
            <div className="border-b bg-amber-50 px-4 py-3 text-right text-sm text-amber-900">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
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
