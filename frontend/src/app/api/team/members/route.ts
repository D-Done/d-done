import { NextRequest, NextResponse } from "next/server";
import { verifyDescopeToken } from "@/lib/verify-descope";
import { supabaseTeam } from "@/lib/supabase-team";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const descopeUser = await verifyDescopeToken(token ?? "");
  if (!descopeUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabaseTeam
    .from("team_members")
    .select("role")
    .eq("email", descopeUser.email)
    .single();

  if (!member || member.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data } = await supabaseTeam
    .from("team_members")
    .select("id, name, role")
    .order("name");

  return NextResponse.json(data ?? []);
}
