# Planner Realtime v3.2 — Full features + Agile UI
- **Agile UI:** Kanban (kéo–thả), Density toggle, Brand BIDV, Mobile-friendly
- **Full features:** Tasks, Realtime, Goals/KPI, Import CSV/Excel, Export Excel, Templates Tuần/Tháng, RBAC theo Space, Email reminders (Edge Function)

## Triển khai (tóm tắt)
1) Supabase: chạy `supabase.sql` (installer), bật Auth (Email/Password). Thêm `profiles` & `space_members` cho cán bộ.
2) GitHub Pages: đổi `config.sample.js` → `config.js` (điền `SUPABASE_URL`, `ANON_KEY`). Copy toàn bộ gói vào `anhvt777.github.io/khkd/`.
3) (Tuỳ chọn) Edge Function `cron-reminder`: deploy và đặt lịch 07:30 VN.

## Lưu ý
- RLS kiểm soát truy cập bằng `space_members`. Nếu user không thuộc Space, sẽ không thấy dữ liệu.
- Kanban đổi trạng thái bằng kéo–thả → cập nhật realtime cho mọi người trong Space.
