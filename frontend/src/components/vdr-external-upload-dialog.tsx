"use client";

import { useState } from "react";
import { Building2, BriefcaseBusiness, Check, Copy, LineChart, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { setProjectDealType } from "@/lib/deal-type-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Step = "type" | "details" | "email" | "done";

type TransactionType = "real_estate_financing" | "ma" | "company_investment";
type PartyRole = "bank" | "insurance" | "fund" | "other";

const TRANSACTION_TYPES: Array<{
  id: TransactionType;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "real_estate_financing", title: 'מימון נדל"ן', subtitle: "בדיקת נאותות למימון פרויקטי נדל״ן", icon: Building2 },
  { id: "ma", title: "M&A", subtitle: "מיזוגים ורכישות של חברות", icon: BriefcaseBusiness },
  { id: "company_investment", title: "השקעה בחברה", subtitle: "בדיקת נאותות להשקעה בחברות", icon: LineChart },
];

const ROLE_LABELS: Record<PartyRole, string> = {
  bank: "בנק",
  insurance: "חברת ביטוח",
  fund: "קרן",
  other: "אחר",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function VdrExternalUploadDialog({ open, onOpenChange, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("type");
  const [submitting, setSubmitting] = useState(false);

  // Step 1: type
  const [transactionType, setTransactionType] = useState<TransactionType | null>(null);

  // Step 2: details
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [role, setRole] = useState<PartyRole>("bank");
  const [roleOtherText, setRoleOtherText] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");

  // Step 3: email
  const [invitedEmail, setInvitedEmail] = useState("");

  // Result
  const [emailSent, setEmailSent] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setStep("type");
    setTransactionType(null);
    setProjectName("");
    setClientName("");
    setRole("bank");
    setRoleOtherText("");
    setCounterpartyName("");
    setInvitedEmail("");
    setEmailSent(false);
    setUploadUrl(null);
    setCopied(false);
  }

  function handleClose(val: boolean) {
    if (!val) reset();
    onOpenChange(val);
  }

  function getRoleLabel(): string {
    if (role === "other" && roleOtherText.trim()) return `אחר: ${roleOtherText.trim()}`;
    return ROLE_LABELS[role];
  }

  async function handleSubmit() {
    if (!transactionType || !projectName.trim() || !invitedEmail.trim()) return;
    setSubmitting(true);
    try {
      const result = await api.createVdrRequest({
        invited_email: invitedEmail.trim(),
        transaction_type: transactionType,
        project_name: projectName.trim(),
        client_name: clientName.trim() || null,
        role: getRoleLabel() || null,
        counterparty_name: counterpartyName.trim() || null,
      });
      const dealType =
        transactionType === "real_estate_financing" ? "real_estate"
        : transactionType === "ma" ? "ma"
        : "company_investment";
      setProjectDealType(result.project_id, dealType, null);
      setEmailSent(result.email_sent);
      setUploadUrl(result.upload_url ?? null);
      setStep("done");
      onSuccess?.();
    } catch (err) {
      toast.error("שגיאה בשליחת ההזמנה", {
        description: err instanceof Error ? err.message : "נסה שנית",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">העלאת VDR באמצעות צד חיצוני</DialogTitle>
          <DialogDescription>
            {step === "type" && "בחר את סוג הפרויקט"}
            {step === "details" && "פרטי הפרויקט"}
            {step === "email" && "שליחת הזמנה לצד החיצוני"}
            {step === "done" && "ההזמנה נשלחה"}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Transaction type ── */}
        {step === "type" && (
          <div className="space-y-3 mt-2">
            {TRANSACTION_TYPES.map((t) => {
              const Icon = t.icon;
              const selected = transactionType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTransactionType(t.id)}
                  className={[
                    "w-full flex items-center gap-4 rounded-xl border-2 p-4 text-right transition",
                    selected
                      ? "border-slate-900 bg-slate-50 dark:bg-slate-800 dark:border-white"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500",
                  ].join(" ")}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{t.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t.subtitle}</div>
                  </div>
                </button>
              );
            })}
            <div className="flex justify-end pt-2">
              <Button
                disabled={!transactionType}
                onClick={() => setStep("details")}
              >
                הבא
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Project details ── */}
        {step === "details" && (
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>שם הפרויקט *</Label>
              <Input
                placeholder="לדוגמה: דה האז תל אביב"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>שם הלקוח</Label>
              <Input
                placeholder="לדוגמה: בנק לאומי"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
            {transactionType === "real_estate_financing" && (
              <div className="space-y-1.5">
                <Label>מי אתה מייצג בעסקה?</Label>
                <Select value={role} onValueChange={(v) => setRole(v as PartyRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {role === "other" && (
                  <Input
                    className="mt-2"
                    placeholder="פרט את התפקיד"
                    value={roleOtherText}
                    onChange={(e) => setRoleOtherText(e.target.value)}
                  />
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>שם הצד הנגדי</Label>
              <Input
                placeholder="לדוגמה: שם היזם"
                value={counterpartyName}
                onChange={(e) => setCounterpartyName(e.target.value)}
              />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep("type")}>חזור</Button>
              <Button
                disabled={!projectName.trim()}
                onClick={() => setStep("email")}
              >
                הבא
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Email ── */}
        {step === "email" && (
          <div className="space-y-4 mt-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-sm space-y-1">
              <div className="font-semibold text-slate-900 dark:text-slate-100">{projectName}</div>
              {clientName && <div className="text-slate-500 dark:text-slate-400">לקוח: {clientName}</div>}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Mail className="h-4 w-4" />
                כתובת מייל של הצד החיצוני *
              </Label>
              <Input
                type="email"
                dir="ltr"
                placeholder="someone@example.com"
                value={invitedEmail}
                onChange={(e) => setInvitedEmail(e.target.value)}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                הצד החיצוני יקבל קישור ייחודי להעלאת מסמכים בלבד. הוא לא יוכל לראות את הדוח או כל מידע אחר.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep("details")}>חזור</Button>
              <Button
                disabled={!invitedEmail.trim() || submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    שולח...
                  </>
                ) : (
                  <>
                    <Send className="ml-2 h-4 w-4" />
                    שלח הזמנה
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === "done" && (
          <div className="mt-4 space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900">
              <Send className="h-7 w-7" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {emailSent ? "ההזמנה נשלחה!" : "הפרויקט נוצר"}
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {emailSent
                  ? `מייל עם קישור להעלאה נשלח ל-${invitedEmail}.`
                  : `לא ניתן לשלוח מייל כרגע. הפרויקט נוצר — שלח את הקישור הבא לצד החיצוני ידנית:`}
              </p>
              {!emailSent && uploadUrl && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 text-left">
                  <span className="flex-1 truncate text-xs font-mono text-slate-700 dark:text-slate-300 select-all" dir="ltr">
                    {uploadUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(uploadUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="shrink-0 rounded p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition"
                    title="העתק קישור"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                ברגע שהמסמכים יועלו, הניתוח יחל אוטומטית ותקבל התראה.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              סגור
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
