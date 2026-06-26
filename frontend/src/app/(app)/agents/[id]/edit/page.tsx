"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { getAgent, configureAgent } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";

export default function EditAgentPage() {
  const params = useParams();
  const router = useRouter();
  const { lang } = useLanguage();
  const agentId = params.id as string;

  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; instructions?: string; general?: string }>({});

  useEffect(() => {
    getAgent(agentId)
      .then((agent) => {
        setName(agent.name ?? "");
        setInstructions(agent.system_prompt ?? "");
      })
      .catch(() => router.push("/agents"))
      .finally(() => setLoading(false));
  }, [agentId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = t("create_agent_error_name", lang);
    if (!instructions.trim()) errs.instructions = t("create_agent_error_instructions", lang);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setErrors({});
    setSubmitting(true);
    try {
      await configureAgent(agentId, { name: name.trim(), system_prompt: instructions.trim() });
      router.push("/agents");
    } catch (err) {
      setErrors({ general: err instanceof Error ? err.message : t("builder_error_msg", lang) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm text-muted-foreground">
        <Link href="/agents" className="flex items-center gap-1 hover:text-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
          {t("agents_back", lang)}
        </Link>
        <span>/</span>
        <span className="text-foreground">{name}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="mb-1 text-2xl font-bold">{lang === "he" ? "עריכת אייגנט" : "Edit Agent"}</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            {lang === "he" ? "עדכן את השם וההנחיות של האייגנט" : "Update the agent name and instructions"}
          </p>

          {errors.general && (
            <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errors.general}
            </div>
          )}

          <div className="mb-6">
            <label className="mb-1.5 block text-sm font-medium">
              {t("create_agent_name_label", lang)}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("create_agent_name_placeholder", lang)}
              className={[
                "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none",
                "placeholder:text-muted-foreground focus:ring-2 focus:ring-ring",
                errors.name ? "border-destructive" : "",
              ].join(" ")}
            />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="mb-8">
            <label className="mb-1.5 block text-sm font-medium">
              {t("create_agent_instructions_label", lang)}
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t("create_agent_instructions_placeholder", lang)}
              rows={14}
              className={[
                "w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none",
                "placeholder:text-muted-foreground focus:ring-2 focus:ring-ring",
                errors.instructions ? "border-destructive" : "",
              ].join(" ")}
            />
            {errors.instructions && <p className="mt-1 text-xs text-destructive">{errors.instructions}</p>}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/agents")}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted"
            >
              {t("run_cancel", lang)}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "he" ? "שמור שינויים" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
