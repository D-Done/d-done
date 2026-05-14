"use client";

/**
 * Minimal i18n for Hebrew/English UI labels.
 * Used by report viewer, checklist panel, and settings.
 */

export type Lang = "he" | "en";

const translations: Record<string, Record<Lang, string>> = {
  // Report viewer section headings
  executive_summary: { he: "סיכום מנהלים", en: "Executive Summary" },
  compound_details: { he: "פרטי המתחם", en: "Compound Details" },
  tenant_table: { he: "טבלת דיירים", en: "Tenant Table" },
  developer_signature: { he: "חתימת היזם", en: "Developer Signature" },
  agreement_addenda: { he: "תוספות להסכם", en: "Agreement Addenda" },
  legal_representation: { he: "באי כוח", en: "Legal Representatives" },
  financing_body: { he: "הגוף המממן", en: "Financing Body" },
  zero_report: { he: 'דו"ח אפס', en: "Zero Report" },
  ubo_chain: { he: "שרשרת בעלות (UBO)", en: "Ownership Chain (UBO)" },
  red_flags: { he: "דגלים אדומים", en: "Red Flags" },
  findings: { he: "ממצאים", en: "Findings" },
  guarantees: { he: "ערבויות וביטחונות", en: "Guarantees & Collateral" },
  apartment_upgrade: { he: "שדרוג ושנמוך דירת התמורה", en: "Apartment Upgrade / Downgrade" },
  planning_legal: { he: "לוחות זמנים וסטטוס תכנוני", en: "Timeline & Planning Status" },
  corporate_governance: { he: "ממשל תאגידי ושעבודים", en: "Corporate Governance & Pledges" },
  // Tenant table columns
  sub_parcel: { he: "תת-חלקה", en: "Sub-parcel" },
  owner_name: { he: "שם בעלים", en: "Owner" },
  signed: { he: "חתם", en: "Signed" },
  date_signed: { he: "תאריך חתימה", en: "Date Signed" },
  warning_note: { he: "הערת אזהרה", en: "Caveat" },
  mortgage: { he: "משכנתא", en: "Mortgage" },
  notes: { he: "הערות", en: "Notes" },
  yes: { he: "כן", en: "Yes" },
  no: { he: "לא", en: "No" },
  na: { he: "—", en: "—" },
  // Risk levels
  risk_high: { he: "גבוה", en: "High" },
  risk_medium: { he: "בינוני", en: "Medium" },
  risk_low: { he: "נמוך", en: "Low" },
  // Checklist
  checklist_title: { he: "רשימת השלמות", en: "Completeness Checklist" },
  checklist_empty: {
    he: "הרשימה נוצרת אוטומטית לאחר השלמת הדוח. אם הרשימה ריקה — לחץ לרענון.",
    en: "The checklist is auto-generated after the report completes. If empty — click to refresh.",
  },
  checklist_refresh: { he: "רענן מהדוח", en: "Refresh from Report" },
  checklist_add: { he: "הוסף פריט", en: "Add Item" },
  checklist_share: { he: "שתף עם צד חיצוני", en: "Share with External Party" },
  checklist_export: { he: "ייצוא Word", en: "Export Word" },
  completed: { he: "הושלם", en: "Completed" },
  pending: { he: "ממתין", en: "Pending" },
  // Settings
  settings_language: { he: "שפה", en: "Language" },
  settings_language_desc: {
    he: "בחר את שפת הדוחות ו-UI לכל המשתמשים בחשבון",
    en: "Set the report and UI language for all users in your account",
  },
  settings_language_he: { he: "עברית", en: "Hebrew" },
  settings_language_en: { he: "אנגלית", en: "English" },
  settings_language_saved: { he: "השפה נשמרה", en: "Language saved" },
  // Report viewer misc
  signing_pct: { he: "אחוז חתימות", en: "Signing Rate" },
  source_prefix: { he: "עמ'", en: "p." },
  report_date_prefix: { he: "תאריך הפקה", en: "Date" },
  addenda_tooltip: {
    he: "ממצאים הנוגעים לתוספות ומכתבי הטבה — בדיקת תיאום מול דו״ח האפס",
    en: "Findings related to addenda and beneficial letters — cross-checked against Zero Report",
  },
};

export function t(key: string, lang: Lang): string {
  return translations[key]?.[lang] ?? key;
}
