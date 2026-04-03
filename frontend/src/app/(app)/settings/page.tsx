"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PastelAvatar } from "@/components/pastel-avatar";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getMe, type MeResponse } from "@/lib/api";

export default function SettingsPage() {
  const [user, setUser] = useState<MeResponse | null>(null);

  useEffect(() => {
    getMe().then(setUser);
  }, []);

  return (
    <>
      <h1 className="text-3xl font-bold">הגדרות</h1>
      <p className="mt-1 text-muted-foreground">ניהול החשבון וההעדפות שלך</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>פרטי חשבון</CardTitle>
          <CardDescription>המידע מסונכרן מחשבון ההתחברות שלך</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
            <div className="flex items-center gap-4">
              <PastelAvatar name={user.name} email={user.email} size="lg" />
              <div>
                <p className="text-lg font-medium">{user.name ?? user.email}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>הגדרות נוספות יתווספו בקרוב — התראות, שפה, ועוד.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>AI</CardTitle>
          <CardDescription>התאמה אישית של הנחיות למודל לפי סוג עסקה</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            ניהול פרומפטים עבור נדל״ן, M&A, השקעה בחברה ועוד.
          </div>
          <Button asChild className="rounded-2xl">
            <Link href="/settings/ai-prompts">ניהול פרומפטים</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
