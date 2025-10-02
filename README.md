# Planner Realtime v3.1 — Export Excel + Templates + Per-Space RBAC + Email Reminders

Bổ sung so với v3:
- **Export Excel** từ tab Công việc/Dashboard.
- **Templates**: tạo List tuần hiện tại, tạo 4 List tuần cho tháng hiện tại, trợ lý tạo Goal tuần/tháng.
- **RBAC theo Space** với bảng `space_members` và RLS thắt chặt: chỉ thành viên Space (hoặc global manager/admin) mới đọc/ghi.
- **Email Reminders** (Supabase Edge Function + Resend), chạy theo lịch (cron).

## 1) Cập nhật Supabase
**SQL:** chạy `supabase.sql` (v3.1, idempotent).  
**Thêm membership:** trong `space_members` → add các cán bộ vào Space tương ứng (role: `viewer`/`member`/`manager`/`admin`).  
> Lưu ý: RLS mới sẽ ẩn dữ liệu task/list/folder/space với user **không** là thành viên Space.

## 2) GitHub Pages
- Đổi `config.sample.js` → `config.js` (điền `SUPABASE_URL`, `ANON_KEY`).  
- Upload toàn bộ thư mục này (v3.1) vào `anhvt777.github.io/planner/`.

## 3) Export Excel
- Tab **Công việc**: nút **Xuất Excel** → xuất tasks theo bộ lọc & view hiện tại.  
- Tab **Dashboard**: **Xuất Excel Dashboard** → sheet Tasks + By Status + By Member.

## 4) Templates
- Tab **Spaces/Lists**:
  - **Tạo List Tuần (hiện tại)**
  - **Tạo 4 List Tuần cho Tháng hiện tại**
  - Goals tuần/tháng: tạo trong tab **Goals/KPI** (đã hỗ trợ).

## 5) Email Reminders (Edge Function)
- Mở `supabase/functions/cron-reminder/index.ts`.  
- Tạo secrets:
  - `SUPABASE_SERVICE_ROLE_KEY` — trong Settings → API.
  - `RESEND_API_KEY` — key của Resend (hoặc thay logic gửi email theo dịch vụ bạn dùng).
  - `FROM_EMAIL` — email người gửi (phải xác minh bên Resend).
  - `BASE_URL` — URL web (VD: `https://anhvt777.github.io/planner/`).
- Deploy:
  ```bash
  supabase functions deploy cron-reminder --project-ref <PROJECT_REF>
  supabase secrets set --env-file ./secrets.env
  supabase functions serve  # test local nếu cần
  ```
- Lên lịch (Dashboard Supabase → Scheduled Functions): cron mỗi 7:30 AM **Asia/Ho_Chi_Minh**:
  - Endpoint: `cron-reminder`
  - Cron: `30 0 * * *` (UTC = 07:30 VN)
- Chức năng: gửi email nhắc các task **đến hạn hôm nay** và **chưa done** cho từng assignee.

## 6) Lưu ý bảo mật
- `anon key` nằm trên web → mọi quyền được kiểm soát bởi **RLS**.
- Hãy kiểm tra kỹ **policies** và `space_members` để đảm bảo đúng phạm vi dữ liệu mỗi người.

## 7) File trong gói
- `index.html`, `app.js`, `config.sample.js`, `supabase.sql`, `README.md`
- `tasks_template.csv`
- `supabase/functions/cron-reminder/index.ts`
- `bidv_logo.png`

Chúc triển khai thuận lợi!
