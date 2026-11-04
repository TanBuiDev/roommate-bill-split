# Ở Ghép — Chia tiền hóa đơn

Website miễn phí chia tiền điện, nước, Internet theo số ngày ở từng thành viên. Chọn nhanh 1–4 tuần, cả kỳ hoặc tùy chọn số ngày; tự lưu trên trình duyệt và xuất/nhập bản sao lưu JSON. Không cần backend hoặc database.

## Cloudflare Pages

Framework preset: `None` · Build command: `exit 0` · Build output directory: `.` · Production branch: `main`.

## Chạy thử

```bash
python3 -m http.server 8080
```

Mở http://localhost:8080. Kiểm thử: `node --test tests/calc.test.mjs`.

**Dữ liệu chỉ lưu tại trình duyệt.** Không có đồng bộ thiết bị, không có truy vấn hoặc thanh toán EVN tự động. Việc chia theo ngày là quy ước phân bổ, không đo điện năng thực tế.
