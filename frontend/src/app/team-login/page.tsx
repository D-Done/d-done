"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export default function TeamLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"email" | "register">("email");

  useEffect(() => {
    if (localStorage.getItem("team_user")) router.replace("/team-tasks");
  }, [router]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/team/me`, {
        headers: { "x-dev-email": email.trim().toLowerCase() },
      });
      if (res.ok) {
        const user = await res.json();
        localStorage.setItem("team_user", JSON.stringify(user));
        router.replace(user.role === "admin" ? "/team-tasks/team" : "/team-tasks");
      } else if (res.status === 403) {
        setStep("register");
      } else {
        setError("שגיאה בהתחברות");
      }
    } catch {
      setError("לא ניתן להתחבר לשרת");
    } finally {
      setLoading(false);
    }
  }

  async function register(role: "admin" | "lawyer") {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/team/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dev-email": email.trim().toLowerCase() },
        body: JSON.stringify({ role, name: name.trim() || email.split("@")[0] }),
      });
      if (!res.ok) throw new Error();
      const user = await res.json();
      localStorage.setItem("team_user", JSON.stringify(user));
      router.replace("/team-tasks");
    } catch {
      setError("שגיאה בהרשמה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "#f8f5fc" }} dir="rtl">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-10">
          <Image src="/arnon-logo.png" alt="ארנון תדמור-לוי" width={180} height={67} className="object-contain" />
        </div>

        {step === "email" && (
          <form onSubmit={handleEmail} className="bg-white rounded-2xl border p-6 shadow-sm space-y-4"
            style={{ borderColor: "#e8d8f4" }}>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#33004e" }}>כתובת מייל</label>
              <input type="email" required autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#33004e]"
                style={{ borderColor: "#d8c0ec" }} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full h-10 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              style={{ background: "#33004e" }}>
              {loading ? "..." : "כניסה"}
            </button>
          </form>
        )}

        {step === "register" && (
          <div className="bg-white rounded-2xl border p-6 shadow-sm space-y-5" style={{ borderColor: "#e8d8f4" }}>
            <p className="text-sm text-center font-medium" style={{ color: "#33004e" }}>הרשמה ראשונה — בחר/י תפקיד</p>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#33004e" }}>שם מלא</label>
              <input type="text" autoFocus value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם פרטי ומשפחה"
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#33004e]"
                style={{ borderColor: "#d8c0ec" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => register("admin")} disabled={loading}
                className="flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors disabled:opacity-50 hover:border-[#33004e]"
                style={{ borderColor: "#d8c0ec" }}>
                <span className="text-2xl">🛡️</span>
                <span className="text-sm font-semibold" style={{ color: "#33004e" }}>אדמין</span>
              </button>
              <button onClick={() => register("lawyer")} disabled={loading}
                className="flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors disabled:opacity-50 hover:border-[#33004e]"
                style={{ borderColor: "#d8c0ec" }}>
                <span className="text-2xl">⚖️</span>
                <span className="text-sm font-semibold" style={{ color: "#33004e" }}>עו״ד</span>
              </button>
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
