"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, LogOut, Mail, ShieldCheck, XCircle, RefreshCw } from "lucide-react";

import { useDescope } from "@descope/nextjs-sdk/client";
import { getMe, logoutSession, type MeResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PastelAvatar } from "@/components/pastel-avatar";

export default function PendingApprovalPage() {
  const router = useRouter();
  const descope = useDescope();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getMe().then((me) => {
      if (!me) {
        router.replace("/login");
        return;
      }
      if (me.approval_status === "approved") {
        router.replace("/dashboard");
        return;
      }
      setUser(me);
    });
  }, [router]);

  async function handleSignOut() {
    try {
      await logoutSession();
    } catch {
      /* ignore */
    }
    try {
      await descope.logout();
    } catch {
      /* ignore */
    }
    router.push("/login");
  }

  async function handleCheckAgain() {
    setChecking(true);
    try {
      const me = await getMe();
      if (me?.approval_status === "approved") {
        router.replace("/dashboard?celebrate=1");
      } else {
        setChecking(false);
      }
    } catch {
      setChecking(false);
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isRejected = user.approval_status === "rejected";

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-slate-50 to-slate-100 p-4" dir="rtl">
      <div className="w-full max-w-lg">
        {/* Main card */}
        <div className="rounded-3xl bg-white shadow-xl border border-slate-200/60 overflow-hidden">
          {/* Top colored band */}
          <div className={`h-2 ${isRejected ? "bg-red-500" : "bg-amber-400"}`} />

          <div className="px-8 pt-10 pb-8 text-center">
            {/* Icon */}
            <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
              isRejected
                ? "bg-red-50 text-red-500"
                : "bg-amber-50 text-amber-500"
            }`}>
              {isRejected ? (
                <XCircle className="h-10 w-10" />
              ) : (
                <Clock className="h-10 w-10" />
              )}
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              {isRejected ? "הבקשה נדחתה" : "הבקשה שלך התקבלה!"}
            </h1>

            {/* Subtitle */}
            <p className="text-slate-500 text-base leading-relaxed mb-8">
              {isRejected
                ? "לצערנו, הבקשה שלך לגישה למערכת D-Done נדחתה. אם אתה חושב שמדובר בטעות, צור קשר עם מנהל המערכת."
                : "תודה שנרשמת ל-D-Done! חשבונך נמצא כעת בתהליך אישור. מנהל המערכת יבדוק את הבקשה שלך בהקדם."}
            </p>

            {/* User info */}
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5 mb-8">
              <div className="flex items-center gap-4 justify-center">
                <PastelAvatar name={user.name} email={user.email} size="lg" />
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{user.name || user.email.split("@")[0]}</p>
                  <p className="text-sm text-slate-400">{user.email}</p>
                </div>
              </div>
            </div>

            {/* Steps (only for pending) */}
            {!isRejected && (
              <div className="rounded-2xl bg-blue-50/50 border border-blue-100 p-5 mb-8 text-right">
                <p className="text-sm font-medium text-blue-900 mb-3">מה קורה עכשיו?</p>
                <div className="space-y-3">
                  {[
                    { icon: ShieldCheck, text: "מנהל המערכת יבדוק את הבקשה שלך" },
                    { icon: Mail, text: "תקבל גישה מלאה ברגע שהבקשה תאושר" },
                  ].map(({ icon: Icon, text }, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm text-blue-800">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {!isRejected && (
                <Button
                  variant="outline"
                  className="w-full gap-2 rounded-xl h-11"
                  onClick={handleCheckAgain}
                  disabled={checking}
                >
                  <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
                  {checking ? "בודק..." : "בדוק שוב"}
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full gap-2 rounded-xl h-11 text-slate-500 hover:text-slate-700"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                התנתק
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          D-Done — בדיקת נאותות חכמה מואצת ע״י בינה מלאכותית
        </p>
      </div>
    </div>
  );
}
