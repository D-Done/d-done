import type { DocumentType } from "@/lib/types";

export type FinanceDocKey =
  | "project_agreement"
  | "zero_report"
  | "credit_committee"
  | "company_docs"
  | "tabu"
  | "signing_protocol"
  | "planning_permit";

export interface FinanceRequiredDoc {
  key: FinanceDocKey;
  title: string;
  subtitle: string;
  docType: DocumentType;
  multiple: boolean;
}

export const FINANCE_REQUIRED_DOCS: FinanceRequiredDoc[] = [
  {
    key: "project_agreement",
    title: "הסכם פרויקט",
    subtitle: 'הסכם תמ"א / קומבינציה',
    docType: "project_agreement",
    multiple: true,
  },
  {
    key: "zero_report",
    title: 'דו"ח אפס',
    subtitle: "דוח אפס / הערכת שווי / אישור זכויות",
    docType: "zero_report",
    multiple: true,
  },
  {
    key: "credit_committee",
    title: "ועדת אשראי",
    subtitle: "פרוטוקול / מסמכי ועדת אשראי",
    docType: "credit_committee",
    multiple: true,
  },
  {
    key: "company_docs",
    title: "מסמכי חברה",
    subtitle: "נסח חברה, תעודת התאגדות",
    docType: "company_extract",
    multiple: true,
  },
  {
    key: "tabu",
    title: "נסח טאבו",
    subtitle: "נסח טאבו מעודכן של הנכס/ים",
    docType: "tabu",
    multiple: true,
  },
  {
    key: "signing_protocol",
    title: "פרוטוקול מורשה חתימה",
    subtitle: "פרוטוקול מורשי חתימה של החברה",
    docType: "signing_protocol",
    multiple: true,
  },
  {
    key: "planning_permit",
    title: "החלטת ועדה / היתר",
    subtitle: "החלטות ועדה לתכנון ובנייה, היתרי בנייה",
    docType: "planning_permit",
    multiple: true,
  },
];
