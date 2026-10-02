<p align="center">
  <img src="apps/web/public/brand/nuphuocthinh/logo.png" alt="Logo nuphuocthinh" width="140" />
</p>

<h1 align="center">nuphuocthinh</h1>
<p align="center">Trình biên tập video Local-First: Tự động Nhận dạng giọng nói (STT), Dịch thuật &amp; Thuyết minh (TTS)</p>
<p align="center">sản phẩm vừa lọ vừa đè tem của iemhanh</p>

<p align="center">
  <a href="https://github.com/huyanhdeptrai/nuphuocthinh/releases/latest">Tải bản Windows</a> ·
  <a href="#bắt-đầu-sử-dụng">Hướng dẫn sử dụng</a> ·
  <a href="#phát-triển">Chạy từ mã nguồn</a>
</p>

## Giới thiệu

**nuphuocthinh** giúp bạn chuyển một video thành nội dung có phụ đề và thuyết minh: nhận dạng lời nói, đọc chữ trong khung hình, dịch sang ngôn ngữ đích, tạo giọng đọc và hoàn thiện trên timeline.

Ứng dụng được thiết kế theo hướng **Local-First**: dự án và media được lưu trên thiết bị, với các runtime xử lý tại máy cho những tính năng được hỗ trợ. Bạn có thể kết hợp công cụ local với Google Dịch hoặc các dịch vụ AI/TTS theo nhu cầu.

![Giới thiệu nuphuocthinh](apps/web/public/brand/nuphuocthinh/introduction.webp)

## Tính năng

| Nhóm | Khả năng |
| --- | --- |
| Nhận dạng giọng nói — STT/ASR | Chuyển lời nói thành văn bản để tạo phụ đề |
| Nhận dạng chữ — OCR | Đọc phụ đề có sẵn trong khung hình video |
| Dịch thuật | Dịch bằng Google Dịch, OpenRouter hoặc API tùy chỉnh tương thích |
| Thuyết minh — TTS | Tạo giọng đọc, quản lý giọng và clone giọng tùy engine/nhà cung cấp |
| Biên tập video | Timeline nhiều lớp, cắt ghép, căn chỉnh phụ đề và âm thanh |
| Hoàn thiện hình ảnh | Che phụ đề gốc, thêm văn bản, lớp phủ và hiệu ứng |
| Xử lý âm thanh | Tách âm thanh và các bước xử lý tùy runtime được cấu hình |
| Xuất và sao lưu | Xuất video, nhập/xuất dự án `.ldvproj` kèm media |

Ứng dụng có giao diện web và bản desktop Windows sử dụng Electron.

## Cài đặt Windows

1. Mở [Releases](https://github.com/huyanhdeptrai/nuphuocthinh/releases/latest).
2. Trong **Assets**, tải bộ cài `.exe` có tên bắt đầu bằng `nuphuocthinh.Setup.`.
3. Chạy bộ cài, chọn thư mục cài đặt và mở **nuphuocthinh**.

Bộ cài dành cho **Windows x64**, kèm Python portable, runtime OCR và model nhận dạng phụ đề. Các runtime GPU/TTS bổ sung được cấu hình hoặc tải qua giao diện khi cần.

Release có file `SHA256SUMS.txt` để đối chiếu checksum của bộ cài.

## Bắt đầu sử dụng

1. Bấm **Bắt đầu dịch videos** ở màn hình chào mừng.
2. Tạo dự án mới hoặc mở dự án đã lưu, rồi nhập video.
3. Dùng **STT/ASR** để nhận dạng lời nói hoặc **OCR** để đọc phụ đề trong video.
4. Kiểm tra văn bản, chọn ngôn ngữ đích và nhà cung cấp dịch.
5. Chỉnh sửa bản dịch và áp dụng phụ đề lên timeline.
6. Chọn engine và giọng **TTS** nếu muốn tạo thuyết minh.
7. Căn chỉnh thời gian, âm lượng, kiểu phụ đề và các lớp hình ảnh, rồi xuất video.

Xuất dự án `.ldvproj` kèm media để sao lưu hoặc chuyển sang máy khác.

## Cấu hình dịch thuật và giọng nói

### Google Dịch

Chọn **Google Dịch** để dịch phụ đề mà không cần nhập API key. Nội dung phụ đề được gửi tới Google khi thực hiện dịch.

Lựa chọn này không áp dụng prompt phong cách hoặc vai nhân vật của chế độ AI. Kết nối có thể bị giới hạn hoặc gián đoạn; lỗi dịch được hiển thị trong giao diện để bạn kiểm tra và thử lại.

### OpenRouter và API tùy chỉnh

Với **OpenRouter**, nhập API key của bạn và chọn model dịch. Với **API tùy chỉnh**, cấu hình endpoint, model và API key theo dịch vụ đang dùng.

Chế độ AI hỗ trợ cấu hình phong cách dịch và vai nhân vật. Kiểm tra kết nối trước khi chạy dịch cho toàn bộ video.

### STT, OCR và TTS local

Các tính năng chạy tại máy cần runtime, model và công cụ xử lý media tương ứng. Tùy engine, bạn có thể cần Python, FFmpeg hoặc runtime GPU.

Trong giao diện, chọn engine/nhà cung cấp và cài các thành phần cần thiết trước khi chạy. Khả năng clone giọng, tách âm thanh và tăng tốc GPU phụ thuộc vào engine và phần cứng. Các nhà cung cấp TTS cloud có thể yêu cầu API key riêng.

## Dữ liệu và kết nối mạng

Dự án và media được lưu trên thiết bị qua **IndexedDB** và **OPFS**. File `.ldvproj` giúp giữ bản sao có thể mang sang thiết bị khác; nên xuất bản sao trước khi xóa dữ liệu trình duyệt.

Google Dịch và các dịch vụ AI/TTS cloud gửi nội dung cần xử lý tới nhà cung cấp khi bạn sử dụng. Việc tải runtime, model, font và một số tài nguyên cũng cần kết nối mạng. Khả năng dùng offline phụ thuộc vào tính năng và những thành phần đã có trên máy.

API key được cấu hình bằng tài khoản của bạn. Một số cấu hình key hiện được lưu chưa mã hóa trên thiết bị; nên sử dụng trên máy cá nhân đáng tin cậy và giữ key ngoài mã nguồn. Server của ứng dụng được thiết kế để chạy local.

## Phát triển

### Yêu cầu

- Node.js và Bun; dự án khai báo Bun `1.2.18`.
- Windows để đóng gói bộ cài desktop Windows.
- Python và runtime/model tương ứng nếu phát triển các tính năng STT/OCR/TTS local.

### Chạy giao diện web

```powershell
git clone https://github.com/huyanhdeptrai/nuphuocthinh.git
cd nuphuocthinh
bun install
bun run dev:web
```

Mở [http://localhost:4000](http://localhost:4000).

Nếu sử dụng các tích hợp phía server, tham khảo `apps/web/.env.example` và tạo `apps/web/.env.local` với cấu hình của bạn.

### Chạy desktop ở chế độ phát triển

```powershell
bun run dev:desktop
```

Lệnh này khởi động server web và mở giao diện Electron.

### Build và đóng gói

Build giao diện web:

```powershell
bun run build:web
```

Chuẩn bị runtime OCR cho bộ cài Windows; bước này cần Python có pip và kết nối mạng để tải interpreter, thư viện và model:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/prepare-ocr-runtime.ps1
```

Bước chuẩn bị desktop cũng sử dụng SDK CapCut TTS trong `.local-services/capcut-tts-api/`, gồm `Voice.json`, package `capcut_tts_api` và các dependency Python trong `.venv/Lib/site-packages`. Xem `scripts/prepare-desktop-web.mjs` để biết các thành phần cần đóng gói.

Khi các runtime đã sẵn sàng:

```powershell
bun run dist:win
```

Bộ cài được tạo trong `apps/desktop/dist/`. Quá trình build có thể cần mạng để tải font và công cụ đóng gói.

### Kiểm tra

```powershell
bun test apps/web/src/dubbing/services/translation.test.ts apps/web/src/services/storage/project-package.test.ts apps/web/src/dubbing/server/runtime-paths.test.ts
```

Chạy toàn bộ test bằng `bun test`, hoặc kiểm tra lint bằng `bun run lint:web`.

## Cấu trúc dự án

| Đường dẫn | Nội dung |
| --- | --- |
| `apps/web/` | Ứng dụng Next.js, giao diện biên tập và API |
| `apps/web/src/core/` | EditorCore và các manager quản lý trạng thái editor |
| `apps/web/src/dubbing/` | Luồng nhận dạng, dịch phụ đề và thuyết minh |
| `apps/web/src/lib/` | Logic nghiệp vụ, actions và commands |
| `apps/web/src/utils/` | Các hàm tiện ích dùng chung |
| `apps/web/public/brand/nuphuocthinh/` | Logo, ảnh giới thiệu và icon |
| `apps/desktop/` | Ứng dụng Electron và cấu hình bộ cài Windows |
| `packages/` | UI và cấu hình dùng chung giữa các workspace |
| `scripts/` | Script phát triển, chuẩn bị runtime và đóng gói |

Giao diện sử dụng **React**, **TypeScript** và **Tailwind CSS**. Editor được quản lý qua **EditorCore**, với actions cho thao tác người dùng và commands cho undo/redo. Monorepo sử dụng **Bun workspaces** và **Turborepo**.

## Giấy phép

Dự án được phân phối theo [giấy phép MIT](LICENSE). Các thư viện, model, giọng nói và dịch vụ bên thứ ba tuân theo giấy phép và điều kiện sử dụng của từng nhà cung cấp.
