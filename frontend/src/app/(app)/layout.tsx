"use client";

import { AppShell } from "@/components/app-shell";
import { LanguageProvider } from "@/lib/language-context";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LanguageProvider>
      <AppShell>{children}</AppShell>
    </LanguageProvider>
  );
}
