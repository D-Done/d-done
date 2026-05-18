"use client";

import { AppShell } from "@/components/app-shell";
import { LanguageProvider } from "@/lib/language-context";
import { DirectionSync } from "@/components/direction-sync";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LanguageProvider>
      <DirectionSync />
      <AppShell>{children}</AppShell>
    </LanguageProvider>
  );
}
