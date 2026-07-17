import { NextRequest, NextResponse } from "next/server";
import { verifyDescopeToken } from "@/lib/verify-descope";
import { supabaseTeam } from "@/lib/supabase-team";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const descopeUser = await verifyDescopeToken(token ?? "");
  if (!descopeUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabaseTeam
    .from("team_members")
    .select("*")
    .eq("email", descopeUser.email)
    .single();

  if (!data) return NextResponse.json({ detail: "NOT_REGISTERED" }, { status: 403 });
  return NextResponse.json({ id: data.id, name: data.name, role: data.role, email: data.email });
}
