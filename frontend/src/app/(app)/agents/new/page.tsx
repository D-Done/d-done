"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { startBuilderSession } from "@/lib/api";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { AgentBuilderContainer } from "@/components/agent-builder-container";

export default function NewAgentPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startBuilderSession()
      .then(({ agent_id }) => setAgentId(agent_id))
      .catch((err) => setError(err instanceof Error ? err.message : t("agents_session_error", lang)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error}</p>
          <button
            onClick={() => router.push("/agents")}
            className="mt-3 text-sm text-muted-foreground underline"
          >
            {t("agents_back_link", lang)}
          </button>
        </div>
      </div>
    );
  }

  if (!agentId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
        <span className="text-foreground">{t("agents_new_label", lang)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <AgentBuilderContainer agentId={agentId} />
      </div>
    </div>
  );
}
