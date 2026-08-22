<p align="center">
  <img src="apps/web/public/logos/lemyloi-dichvideo/logo.png" alt="Lemyloi-dichvideos logo" width="160" />
</p>

<h1 align="center">Lemyloi-dichvideos</h1>

<p align="center">
  Trình chỉnh sửa video local-first dành cho quy trình nhận dạng, dịch và thuyết minh video.
</p>

## Giới thiệu

Lemyloi-dichvideos lấy mã nguồn từ [Editkub](https://github.com/9teeedev/editkub) và được tinh chỉnh thêm cho quy trình làm video đa ngôn ngữ:

- ASR nhận dạng lời nói và quản lý cue phụ đề trên timeline.
- OCR phụ đề gốc: quét nhanh thời gian, vị trí và kích thước subtitle xuất hiện trực tiếp trong video.
- Dịch phụ đề, đồng bộ vị trí phụ đề/lớp phủ theo subtitle gốc.
- Thuyết minh/TTS, quản lý giọng nói, tách lời và cân chỉnh âm thanh.
- Chỉnh sửa timeline, lớp phủ, hiệu ứng làm mờ để che subtitle gốc.

Đây là mã nguồn mở để bạn có thể **vibe code**: tự tạo ngôn ngữ phù hợp với mình, điều chỉnh giao diện/quy trình làm việc, hoặc bổ sung bất kỳ chức năng nào cần cho dự án video.

## Demo

Timeline đa lớp với phụ đề gốc, bản dịch, vùng che subtitle và các track thuyết minh/TTS:

![Demo Lemyloi-dichvideos editor](apps/web/public/demo/editor-workflow.png)

## Cài đặt nhanh

Yêu cầu: [Bun](https://bun.sh/) và Node.js tương thích.

```bash
git clone https://github.com/Lexombien/lemyloi-dichvideos.git
cd lemyloi-dichvideos
bun install
bun run dev:web
```

Mở `http://localhost:4100`.

## Đóng gói Windows

```bash
bun run dist:win
```

Installer `.exe` được tạo trong `apps/desktop/dist/`. Bản phát hành sẵn dùng được đăng tại trang [Releases](https://github.com/Lexombien/lemyloi-dichvideos/releases).

## Đóng góp và ủng hộ

> 🎉 Fun fact: dự án này **chưa từng nhận được donate**. Nếu nó đã giúp bạn đỡ mất công làm video, một ly cà phê nhỏ sẽ là động lực rất lớn để tiếp tục sửa bug và thêm tính năng.

Quét QR phù hợp với ứng dụng bạn dùng:

<table>
  <tr>
    <td align="center" width="50%">
      <strong>MoMo</strong><br />
      <img src="apps/web/public/donate/momo-qr.png" alt="QR ủng hộ MoMo" width="260" /><br />
      <code>0335127075</code>
    </td>
    <td align="center" width="50%">
      <strong>VPBank</strong><br />
      <img src="apps/web/public/donate/vpbank-qr.png" alt="QR ủng hộ VPBank" width="260" /><br />
      <code>275250597</code>
    </td>
  </tr>
</table>

Cảm ơn anh/chị đã ủng hộ — dù là donate, góp ý, hay một ý tưởng hay để cùng vibe code. 💛

## Ghi nhận mã nguồn và giấy phép

Dự án là bản tinh chỉnh từ [Editkub](https://github.com/9teeedev/editkub), đồng thời kế thừa chuỗi mã nguồn mở của dự án gốc. Bản quyền và điều kiện [MIT License](LICENSE) của các tác giả gốc vẫn được giữ nguyên.
