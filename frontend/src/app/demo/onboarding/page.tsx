"use client";

import { OnboardingDialog } from "@/components/ui/onboarding-dialog";

/** Demo page for OnboardingDialog component. */
export default function OnboardingDemoPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <OnboardingDialog defaultOpen={true} />
    </div>
  );
}
