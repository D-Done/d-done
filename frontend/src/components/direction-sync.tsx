"use client";

import { useEffect } from "react";
import { useLanguage } from "@/lib/language-context";

export function DirectionSync() {
  const { lang, dir } = useLanguage();
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [lang, dir]);
  return null;
}
