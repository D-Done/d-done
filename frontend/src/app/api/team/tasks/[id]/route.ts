import { NextRequest, NextResponse } from "next/server";
import { verifyDescopeToken } from "@/lib/verify-descope";
import { supabaseTeam, type DBTask } from "@/lib/supabase-team";

async function getMember(email: string) {
  const { data } = await supabaseTeam
    .from("team_members").select("*").eq("email", email).single();
  return data;
}

function formatTask(t: DBTask) {
  return {
    id: t.id, title: t.title, description: t.description, status: t.status,
    priority: t.priority, assigned_to_id: t.assigned_to_id,
    assigned_to_name: t.assigned_to?.name ?? "",
    created_by_name: t.created_by?.name ?? null,
    due_date: t.due_date, created_at: t.created_at,
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const descopeUser = await verifyDescopeToken(token ?? "");
  if (!descopeUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await getMember(descopeUser.email);
  if (!member) return NextResponse.json({ detail: "NOT_REGISTERED" }, { status: 403 });

  const { data: task } = await supabaseTeam.from("team_tasks").select("*").eq("id", id).single();
  if (!task) return NextResponse.json({ error: "משימה לא נמצאה" }, { status: 404 });
  if (member.role !== "admin" && task.assigned_to_id !== member.id) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (member.role === "admin") {
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
  }

  const { data, error } = await supabaseTeam
    .from("team_tasks")
    .update(updates)
    .eq("id", id)
    .select("*, assigned_to:team_members!assigned_to_id(id,name), created_by:team_members!created_by_id(id,name)")
    .single();

  if (error || !data) return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  return NextResponse.json(formatTask(data as DBTask));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const descopeUser = await verifyDescopeToken(token ?? "");
  if (!descopeUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await getMember(descopeUser.email);
  if (!member || member.role !== "admin") {
    return NextResponse.json({ error: "רק אדמין יכול למחוק" }, { status: 403 });
  }

  await supabaseTeam.from("team_tasks").delete().eq("id", id);
  return new NextResponse(null, { status: 204 });
}
