import { NextRequest, NextResponse } from "next/server";
import { verifyDescopeToken } from "@/lib/verify-descope";
import { supabaseTeam, type DBTask } from "@/lib/supabase-team";

async function getMember(email: string) {
  const { data } = await supabaseTeam
    .from("team_members")
    .select("*")
    .eq("email", email)
    .single();
  return data;
}

function formatTask(t: DBTask) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigned_to_id: t.assigned_to_id,
    assigned_to_name: t.assigned_to?.name ?? "",
    created_by_name: t.created_by?.name ?? null,
    due_date: t.due_date,
    created_at: t.created_at,
  };
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const descopeUser = await verifyDescopeToken(token ?? "");
  if (!descopeUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await getMember(descopeUser.email);
  if (!member) return NextResponse.json({ detail: "NOT_REGISTERED" }, { status: 403 });

  let query = supabaseTeam
    .from("team_tasks")
    .select("*, assigned_to:team_members!assigned_to_id(id,name), created_by:team_members!created_by_id(id,name)")
    .order("created_at", { ascending: false });

  if (member.role !== "admin") {
    query = query.eq("assigned_to_id", member.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  return NextResponse.json((data as DBTask[]).map(formatTask));
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const descopeUser = await verifyDescopeToken(token ?? "");
  if (!descopeUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await getMember(descopeUser.email);
  if (!member) return NextResponse.json({ detail: "NOT_REGISTERED" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { title, description, priority, assigned_to_id, due_date } = body;

  if (!title) return NextResponse.json({ error: "כותרת חובה" }, { status: 400 });
  if (member.role !== "admin" && assigned_to_id !== member.id) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { data: assigned } = await supabaseTeam
    .from("team_members").select("id").eq("id", assigned_to_id).single();
  if (!assigned) return NextResponse.json({ error: "חבר צוות לא נמצא" }, { status: 404 });

  const { data, error } = await supabaseTeam
    .from("team_tasks")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      priority: priority ?? "medium",
      assigned_to_id,
      created_by_id: member.id,
      due_date: due_date ?? null,
    })
    .select("*, assigned_to:team_members!assigned_to_id(id,name), created_by:team_members!created_by_id(id,name)")
    .single();

  if (error || !data) return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  return NextResponse.json(formatTask(data as DBTask), { status: 201 });
}
