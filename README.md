# VietQR Scanner Demo

Prototype HTML/CSS/JavaScript/jQuery gồm ba bước:

1. Quét VietQR bằng camera hoặc đọc ảnh `qr-sample.png`.
2. Hiển thị người nhận, ngân hàng, số tài khoản và nhập số tiền.
3. Vẽ dữ liệu cùng thời gian hiện tại lên nền `1.png`, sau đó cho phép tải PNG.

## Chạy thử

Camera chỉ hoạt động trong secure context. Chạy một web server tại thư mục dự án, ví dụ:

```powershell
python -m http.server 8080
```

Sau đó mở `http://localhost:8080`. Không mở trực tiếp bằng giao thức `file://`.

Nút **Dùng QR mẫu** đọc file `qr-sample.png`. jQuery và jsQR được tải từ CDN nên lần chạy đầu cần có kết nối Internet.

> Đây là giao diện mô phỏng, không kết nối API ngân hàng và không thực hiện chuyển tiền thật. Ảnh kết quả luôn có nhãn “BẢN DEMO • MÔ PHỎNG”.
