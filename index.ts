// supabase/functions/cron-reminder/index.ts
// Deno Deploy (Supabase Edge Functions). Sends reminder emails for tasks due today & not done.
// Requires secret: RESEND_API_KEY and FROM_EMAIL (and optionally BASE_URL for app link).
// Schedule in Supabase: e.g., every day 07:30 Asia/Ho_Chi_Minh.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type TaskRow = { id:string; title:string; due_date:string; status:string; points:number; note:string|null; assignee:string|null };
type Profile = { id:string; email:string; full_name:string|null };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // service key for server-side
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL")!;
  const BASE_URL = Deno.env.get("BASE_URL") ?? "https://example.com";

  const today = new Date(); // in UTC; adjust to local VN (+7)
  const vn = new Date(today.getTime() + 7*60*60*1000);
  const iso = vn.toISOString().slice(0,10);

  // Query tasks due today and not done
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id,title,due_date,status,points,note,assignee,profiles:assignee(email,full_name)")
    .eq("due_date", iso)
    .neq("status","done");

  if (error) return new Response("DB error: "+error.message, { status: 500 });

  const grouped: Record<string, TaskRow[]> = {};
  for(const t of tasks as any[]){
    const key = t.profiles?.email || "unknown";
    grouped[key] = grouped[key] || [];
    grouped[key].push(t);
  }

  const messages = Object.entries(grouped).map(([email, items])=>{
    const lines = items.map(it=>`- ${it.title} (KPI: ${it.points||0})`).join("\n");
    return {
      from: FROM_EMAIL,
      to: email,
      subject: `Nhắc việc hôm nay (${iso}) — ${items.length} công việc chưa xong`,
      text: `Chào bạn,\n\nHôm nay bạn còn ${items.length} việc chưa hoàn thành:\n${lines}\n\nXem chi tiết: ${BASE_URL}\n\nTrân trọng.`
    };
  });

  for(const m of messages){
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(m)
    });
  }

  return new Response(`Sent ${messages.length} emails for ${iso}.`);
}

Deno.serve(handler);
