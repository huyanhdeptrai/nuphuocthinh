import { BasePage } from "@/app/base-page";

export default function Page() {
	return (
		<BasePage title="Dữ liệu và quyền riêng tư" description="nuphuocthinh — bản tùy chỉnh dùng trên máy cá nhân.">
			<p>Dự án và media được lưu trên thiết bị. Bản này đã gỡ tracker và chức năng gửi góp ý về tác giả.</p>
			<p>Các tính năng AI cloud gửi nội dung tới nhà cung cấp bạn chọn. Các bộ GPU/TTS có thể kết nối GitHub để kiểm tra và tải runtime.</p>
			<p>Mã nguồn kế thừa được ghi nhận trong README và LICENSE. Giấy phép của thư viện, model và dịch vụ bên thứ ba vẫn áp dụng.</p>
		</BasePage>
	);
}
