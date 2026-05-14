"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getOrgLanguage } from "@/lib/api";
import type { Lang } from "@/lib/i18n";

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  loading: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "he",
  setLang: () => {},
  loading: true,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("he");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrgLanguage()
      .then((r) => setLangState(r.language as Lang))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, loading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
