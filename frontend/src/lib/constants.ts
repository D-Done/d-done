/**
 * Shared application constants.
 *
 * Import from here instead of scattering magic strings across components.
 */

// ---------------------------------------------------------------------------
// Domain label maps (document types, findings, risk, status)
// ---------------------------------------------------------------------------

import type {
  DocumentType,
  FindingCategory,
  FindingSeverity,
  RiskLevel,
  TransactionStatus,
} from "./types";

/** Hebrew labels for document types */
export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  tabu: "נסח טאבו",
  tama: 'תב"ע / תמ"א',
  zero_report: 'דו"ח אפס',
  corporate_protocol: "פרוטוקול חברה",
  company_extract: "מסמכי חברה",
  project_agreement: "הסכם פרויקט",
  credit_committee: "ועדת אשראי",
  signing_protocol: "פרוטוקול מורשה חתימה",
  planning_permit: "החלטת ועדה / היתר",
  id: "תעודת זהות",
  lien: "שעבוד / עיקול",
  other: "אחר",
};

/** Display label for a file: use "הסכם פרויקט" when stored as "other" but filename suggests project agreement. */
export function getDocTypeDisplayLabel(
  originalName: string,
  docType: string,
): string {
  if (docType === "other") {
    const n = (originalName || "").toLowerCase();
    if (
      n.includes("הסכם") ||
      n.includes("פרויקט") ||
      n.includes("agreement") ||
      n.includes("project")
    ) {
      return "הסכם פרויקט";
    }
  }
  return DOC_TYPE_LABELS[docType as DocumentType] ?? docType;
}

/** Hebrew labels for finding categories */
export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  lien: "שעבודים",
  ownership: "בעלות",
  zoning: "תכנון ובנייה",
  corporate: "תאגידי",
  identity: "זיהוי",
  financial: "פיננסי",
  legal: "משפטי",
  addendum: "נספח",
  regulatory: "רגולטורי",
  other: "אחר",
};

/** Hebrew labels for finding severities */
export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: "קריטי",
  warning: "אזהרה",
  info: "מידע",
};

/** Severity color mapping for badges */
export const SEVERITY_VARIANT: Record<
  FindingSeverity,
  "destructive" | "secondary" | "outline"
> = {
  critical: "destructive",
  warning: "secondary",
  info: "outline",
};

/** Hebrew labels for risk levels */
export const RISK_LABELS: Record<RiskLevel, string> = {
  high: "סיכון גבוה",
  medium: "סיכון בינוני",
  low: "סיכון נמוך",
};

/** Risk color mapping */
export const RISK_COLORS: Record<RiskLevel, string> = {
  high: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-green-100 text-green-800 border-green-300",
};

/** Hebrew labels for transaction statuses */
export const STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: "ממתין",
  processing: "בעיבוד",
  completed: "הושלם",
  failed: "נכשל",
  partial: "חלקי",
  needs_review: "דורש בדיקה",
};

/** Status color mapping for badges */
export const STATUS_VARIANT: Record<
  TransactionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  processing: "secondary",
  completed: "default",
  failed: "destructive",
  partial: "secondary",
  needs_review: "destructive",
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const ROUTE_ROOT = "/";
export const ROUTE_LOGIN = "/login";
export const ROUTE_DASHBOARD = "/dashboard";
export const ROUTE_PENDING_APPROVAL = "/pending-approval";
export const ROUTE_INVITE = "/invite";
export const ROUTE_LOGIN_SESSION_INVALID = "/login?session=invalid";

export const buildInviteRoute = (token: string) =>
  `${ROUTE_INVITE}?token=${encodeURIComponent(token)}`;

// ---------------------------------------------------------------------------
// Descope
// ---------------------------------------------------------------------------

export const DESCOPE_FLOW_SIGN_UP_OR_IN = "sign-up-or-in";

// ---------------------------------------------------------------------------
// OAuth providers
// ---------------------------------------------------------------------------

export const PROVIDER_GOOGLE = "google";
export const PROVIDER_MICROSOFT = "microsoft";
export const PROVIDER_GENERIC_OAUTH = "oauth";

/** loginId prefixes used by Descope when "Keep email as user attribute only" is enabled. */
export const LOGIN_ID_PREFIXES = {
  [PROVIDER_GOOGLE]: PROVIDER_GOOGLE,
  [PROVIDER_MICROSOFT]: PROVIDER_MICROSOFT,
  apple: "apple",
  github: "github",
} as const;

// ---------------------------------------------------------------------------
// Invite preview reason codes (must match backend app/core/constants.py)
// ---------------------------------------------------------------------------

export const INVITE_REASON_INVALID = "invalid";
export const INVITE_REASON_REVOKED = "revoked";
export const INVITE_REASON_EXPIRED = "expired";
export const INVITE_REASON_ALREADY_USED = "already_used";

// ---------------------------------------------------------------------------
// Backend error detail strings (must match backend app/core/constants.py)
// ---------------------------------------------------------------------------

export const ERROR_INVITATION_REQUIRED = "Invitation required";
