import { NextRequest, NextResponse } from "next/server";
import { verifyDescopeToken } from "@/lib/verify-descope";
import { supabaseTeam } from "@/lib/supabase-team";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const descopeUser = await verifyDescopeToken(token ?? "");
  if (!descopeUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const role = body.role as string;
  if (role !== "admin" && role !== "lawyer") {
    return NextResponse.json({ error: "תפקיד לא תקין" }, { status: 400 });
  }

  // Return existing if already registered
  const { data: existing } = await supabaseTeam
    .from("team_members")
    .select("*")
    .eq("email", descopeUser.email)
    .single();
  if (existing) {
    return NextResponse.json({ id: existing.id, name: existing.name, role: existing.role, email: existing.email });
  }

  const name = descopeUser.name || descopeUser.email.split("@")[0];
  const { data, error } = await supabaseTeam
    .from("team_members")
    .insert({ email: descopeUser.email, name, role })
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: "שגיאה בהרשמה" }, { status: 500 });
  return NextResponse.json({ id: data.id, name: data.name, role: data.role, email: data.email }, { status: 201 });
}
