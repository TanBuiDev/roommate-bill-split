# Ở Ghép — Chia tiền hóa đơn

Website miễn phí tính tiền điện, nước, Internet theo số ngày ở của mỗi người. Mã nguồn nằm trong một file `index.html`; không cần Node.js, backend hay trả phí hosting.

## Chức năng

- Chọn hóa đơn, nhập số tiền, chọn tháng và số ngày của kỳ.
- Thêm/xóa người ở, chỉnh sửa tên; chọn **1, 2, 3, 4 tuần**, **Cả kỳ** hoặc **Tùy chọn ngày**.
- Chia theo số ngày và phân bổ số đồng lẻ để tổng luôn khớp hóa đơn.
- Sao chép kết quả gửi nhóm.
- **Supabase Auth**: đăng nhập bằng magic link gửi tới email.
- **Supabase Database**: tên người ở được tự lưu, hóa đơn được lưu theo tháng; đánh dấu từng người đã trả tiền.
- Dữ liệu được bảo vệ bởi PostgreSQL Row Level Security; mỗi tài khoản chỉ thấy dữ liệu của mình.

## Tài khoản dịch vụ

- GitHub: https://github.com/TanBuiDev/roommate-bill-split
- Supabase project: https://supabase.com/dashboard/project/loovjgylbookhouxjkaf
- Supabase URL: https://loovjgylbookhouxjkaf.supabase.co
- Cloudflare Pages project **`oghep`** đã tạo với hostname **`oghep.pages.dev`** (chưa được deploy vì Cloudflare Git installation báo lỗi; hostname hiện chưa phục vụ web). Project Pages `roommate-bill-split` trước đó vẫn còn, chưa triển khai.
- Website chạy thử trên Cloudflare Workers: https://oghep.devbui058.workers.dev/

Website Workers cũ vẫn được giữ hoạt động tại `https://roommate-bill-split.devbui058.workers.dev/`, nhưng ưu tiên URL ngắn phía trên.

Chỉ có **publishable** Supabase key trong frontend, không sử dụng `service_role` hoặc secret key. RLS bắt buộc đăng nhập, bảo vệ dữ liệu khỏi tài khoản khác.

## Thiết lập Supabase Auth (bắt buộc để email đăng nhập hoạt động)

Mở **Supabase Dashboard → Authentication → URL Configuration**.

- **Site URL**: `https://oghep.devbui058.workers.dev`
- **Redirect URLs**, thêm: `https://oghep.devbui058.workers.dev/**`

Khi Cloudflare Pages `oghep` đã được triển khai, thêm `https://oghep.pages.dev/**` vào Redirect URLs và có thể chuyển Site URL sang `https://oghep.pages.dev`.

Đảm bảo **Email provider** được bật. Mặc định Supabase gửi Magic Link, miễn phí nhưng có giới hạn số email; nếu chạm giới hạn, đợi hoặc cấu hình SMTP riêng.

## Cloudflare Pages

Lúc tích hợp tự động, Cloudflare API trả lỗi `There is an internal issue with your Cloudflare Pages Git installation` (HTTP 401). Cần kiểm tra https://github.com/settings/installations → **Cloudflare Workers and Pages** → Configure → Repository access → cấp quyền truy cập `roommate-bill-split`. Nếu Cloudflare vẫn báo lỗi, theo https://developers.cloudflare.com/pages/configuration/git-integration/troubleshooting/ thử cài đặt lại GitHub app; việc gỡ app có thể ảnh hưởng các dự án khác đang dùng auto-deploy.

Với Pages, cấu hình: **Framework preset** `None`, **Build command** `exit 0`, **Output directory** `.`, **Production branch** `main`. Có thể dùng Direct Upload nếu Git integration chưa sửa được, nhưng không có tự động triển khai khi push GitHub.

## Dữ liệu

- `public.room_members`: `id`, `user_id`, `name`, `sort_order`
- `public.bill_history`: `id`, `user_id`, `bill_type`, `bill_month`, `amount`, `billing_days`, `people` (JSON chứa các khoản chia và trạng thái đã trả).

Hai bảng có RLS và 4 policies CRUD riêng cho từng user. Mỗi kỳ hóa đơn được khóa theo `(user_id, bill_type, bill_month)`.

Chia theo số ngày là **quy ước phân bổ**, không đo lượng điện thực tế. Website không kết nối EVN, không chuyển khoản hay thanh toán thực tế.

## Pages URL ngắn

`bill.pages.dev` không khả dụng; Cloudflare tự tạo hậu tố khi thử tạo project `bill`. Project trùng tên đã được xóa. `oghep.pages.dev` được cấp chính xác nhưng **chưa có nội dung triển khai**. Để triển khai thủ công từ thư mục đã clone repo:

```bash
npx wrangler login
npx wrangler pages deploy . --project-name oghep --branch main
```

Hoặc vào Cloudflare Pages project `oghep` và tải một thư mục chứa `index.html` lên qua **Create a new deployment** (Direct Upload). Cách này không tự động triển khai khi push GitHub. Lưu ý về giới hạn chuyển từ Direct Upload sang Git integration; muốn CI tự động cần quy trình GitHub Actions + Wrangler hoặc tạo project Git-connected khác sau khi sửa lỗi app Cloudflare.
