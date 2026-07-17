import { createClient } from "@supabase/supabase-js";

export const supabaseTeam = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

export type DBMember = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "lawyer";
  created_at: string;
};

export type DBTask = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assigned_to_id: string;
  created_by_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  assigned_to?: { id: string; name: string };
  created_by?: { id: string; name: string } | null;
};
