export interface TranslationStylePreset {
	id: string;
	name: string;
	prompt: string;
}

export const DEFAULT_TRANSLATION_STYLES: TranslationStylePreset[] = [
	{
		id: "smart-general",
		name: "⭐ AI Tổng hợp thông minh",
		prompt: `BỐI CẢNH: KHÔNG biết trước thể loại — SUY LUẬN từ tên riêng, từ khóa, văn phong rồi áp văn phong tương ứng. MẶC ĐỊNH là HIỆN ĐẠI; chỉ chuyển thể loại khi ngữ cảnh xác nhận rõ.
★ Cổ trang / cung đấu / kiếm hiệp / tiên hiệp (dấu hiệu: Hoàng thượng, triều đình, giang hồ, tu tiên) → ta/ngươi/hắn/nàng, Trẫm/Thần/Bản vương, tên Trung phiên Hán-Việt; TUYỆT ĐỐI không lẫn từ hiện đại (tôi, bạn, OK, công ty).
★ Anime / Nhật (dấu hiệu: tên Romaji như Naruto, Tanjiro) → GIỮ tên Romaji, giữ kính ngữ Senpai/Sensei/Sama; học đường tớ/cậu.
★ Isekai / game (Status, Skill, Level, Guild) → giữ thuật ngữ tiếng Anh; 魔王→Ma vương, 勇者→Dũng giả, 異世界→Dị giới.
★ Hàn (tên Lee/Kim/Park, Oppa) → giữ tên Latin; Sunbae→Tiền bối.
★ Âu Mỹ (John/Sarah, FBI) → giữ nguyên tên + tổ chức, KHÔNG phiên âm kiểu “Giôn”.
★ GIỌNG ĐIỆU THEO CẢNH: hài → câu gọn sắc, chốt đúng punch line; kinh dị → câu ngắn rợn, dùng “…” tạo suspense; hành động → dứt khoát, mạnh; kể chuyện/review → ngôi thứ ba hắn/nàng/gã.
★ THÀNH NGỮ: ưu tiên thành ngữ/khẩu ngữ tương đương trong ngôn ngữ đích thay vì dịch chữ.`,
	},
	{
		id: "movie-recap",
		name: "Tóm Tắt / Kể Truyện Phim",
		prompt: `BỐI CẢNH: video KỂ TRUYỆN / TÓM TẮT PHIM — một giọng kể dẫn dắt toàn bộ, xen thoại nhân vật.
★ Lời KỂ: ngôi thứ ba (hắn, nàng, gã, y, ả); trầm ấm, lôi cuốn, nhịp gọn tạo kịch tính; nửa văn viết nửa văn nói cho dễ nghe; dùng “…” tạo khoảng lặng khi cần.
★ Thoại NHÂN VẬT: theo bối cảnh phim — hiện đại (mặc định) xưng đúng quan hệ; cổ trang (chỉ khi ngữ cảnh xác nhận) dùng Hán-Việt (ta/ngươi, Hoàng thượng).
★ TỪ NỐI DẪN TRUYỆN: 他没想到→Hắn không ngờ | 就在这时→Đúng lúc này | 结果→Kết quả | 然而→Nhưng.
★ TÊN RIÊNG: tên Trung → phiên Hán-Việt; tên Tây/tổ chức quốc tế → giữ nguyên.`,
	},
	{
		id: "historical-palace",
		name: "Phim Cổ Trang / Cung Đấu",
		prompt: `BỐI CẢNH: phim CỔ TRANG / CUNG ĐẤU Trung Quốc — không khí cung đình, tôn ti nghiêm ngặt.
★ VĂN PHONG: trang trọng, uy nghiêm; đại từ ta/ngươi/hắn/nàng; giữ khí chất từng vai; TUYỆT ĐỐI không dùng từ hiện đại (tôi, bạn, OK, công ty, cảnh sát).
★ TỰ XƯNG THEO THÂN PHẬN: 朕→Trẫm, 臣/微臣→Thần, 本王→Bản vương, 本宫→Bản cung.
★ CHỨC DANH: 皇上→Hoàng thượng, 太后→Thái hậu, 王爷→Vương gia, 丞相→Thừa tướng, 太子→Thái tử, 公主→Công chúa, 大人→Đại nhân, 小姐→Tiểu thư, 公子→Công tử, 夫人→Phu nhân.
★ LỄ NGHI: 报告→Bẩm, 遵命→Tuân lệnh, 告退→Cáo lui.
★ TÊN RIÊNG: tên người Trung → phiên Hán-Việt (顾未易 → Cố Vị Dịch).`,
	},
	{
		id: "wuxia-xianxia",
		name: "Phim Kiếm Hiệp / Tiên Hiệp",
		prompt: `BỐI CẢNH: phim KIẾM HIỆP / TIÊN HIỆP — giang hồ, môn phái, tu luyện.
★ VĂN PHONG: hào sảng, dứt khoát, khí phách giang hồ; đại từ ta/ngươi/hắn/nàng, tại hạ; cảnh đánh nhau → câu cực ngắn (住手！→Dừng tay! | 受死吧！→Chịu chết đi!); đối thoại → trang trọng (得罪了→Xin đắc tội); không dùng từ hiện đại.
★ SƯ MÔN / GIANG HỒ: 师父→Sư phụ, 师兄→Sư huynh, 师姐→Sư tỉ, 掌门→Chưởng môn, 前辈→Tiền bối, 大侠→Đại hiệp.
★ CẤP BẬC TU LUYỆN: 练气→Luyện Khí, 筑基→Trúc Cơ, 金丹→Kim Đan, 元婴→Nguyên Anh, 化神→Hóa Thần, 渡劫→Độ Kiếp, 大乘→Đại Thừa. Giữ đúng chuỗi, nhất quán cả video.
★ THUẬT NGỮ: 金手指→Kim thủ chỉ, 法宝→Pháp bảo, 结界→Kết giới, 走火入魔→Tẩu hỏa nhập ma, 轻功→Khinh công.
★ TÊN RIÊNG: người/chiêu thức/môn phái → Hán-Việt (令狐冲→Lệnh Hồ Xung, 降龙十八掌→Hàng Long Thập Bát Chưởng, 少林→Thiếu Lâm).`,
	},
	{
		id: "transmigration",
		name: "Phim Xuyên Không",
		prompt: `BỐI CẢNH: phim XUYÊN KHÔNG — người hiện đại sống trong thế giới cổ đại. Linh hồn thể loại là HAI TẦNG NGÔN NGỮ, phải giữ tương phản đó.
★ Nhân vật xuyên không ĐỘC THOẠI / nói trong đầu → giọng HIỆN ĐẠI: tôi/tao, trời ơi, xong đời, toang rồi.
★ Nhân vật xuyên không nói VỚI NGƯỜI CỔ ĐẠI → cố bắt chước cổ trang (ta, ngươi, Thần); lỡ lời hiện đại → GIỮ NGUYÊN, đó là chất hài.
★ Người cổ đại → Hán-Việt thuần: ta/ngươi/hắn/nàng, Trẫm, Thần, Vương phi; tuyệt đối không lỡ từ hiện đại.
★ THUẬT NGỮ: 穿越→Xuyên không, 金手指→Kim thủ chỉ, 系统→Hệ thống, 嫡女→Đích nữ, 庶女→Thứ nữ, 原身→Thân chủ gốc.
★ GIỌNG ĐIỆU: cảnh lộ thân phận → cuống, lạc quẻ; cảnh cung đấu → sắc bén, trang trọng.
★ TÊN RIÊNG: tên người Trung → phiên Hán-Việt.`,
	},
	{
		id: "modern-action-comedy",
		name: "Phim Hiện Đại / Hành Động / Hài",
		prompt: `BỐI CẢNH: phim TRUNG QUỐC HIỆN ĐẠI — đời thường, công sở, hành động, hài, sinh tồn. Xưng hô hiện đại; TUYỆT ĐỐI không dùng từ cổ trang (ta, ngươi, Vương gia, Trẫm) trừ khi nhân vật đang xem/đọc phim cổ trang.
★ THUẬT NGỮ: 老板→Sếp, 总裁→Tổng tài, 黑帮→Băng đảng, 老大→Trùm, 小弟→Đàn em.
★ Đời thường → văn nói tự nhiên, thoát ý. Hành động/căng thẳng → câu ngắn, tempo nhanh, dứt khoát; lời kể review → ngôi ba hắn/gã/y.
★ Hài → câu gọn sắc, chốt đúng punch line; dịch sát mà mất hài thì sáng tạo câu hài mới cùng ý.
★ Sinh tồn/nguy hiểm → gấp gáp; mệnh lệnh ngắn dứt khoát.
★ TÊN RIÊNG: tên Trung → phiên Hán-Việt; tên Tây/tổ chức (John, FBI, NASA) → giữ nguyên.`,
	},
	{
		id: "horror-supernatural",
		name: "Phim Kinh Dị / Linh Dị",
		prompt: `BỐI CẢNH: phim KINH DỊ (Trung, linh dị, hay Âu Mỹ) — không khí rợn người là ưu tiên số 1.
★ VĂN PHONG: câu ngắn sắc lạnh, dùng “…” tạo suspense; sợ → thì thầm; hoảng → gấp gáp. Ma quỷ lên tiếng → giọng lạnh, câu cực ngắn.
★ XƯNG HÔ: hiện đại (mặc định) → tôi/tao/mày; cổ trang (chỉ khi bối cảnh cổ đại) → ta/ngươi. KHÔNG trộn hai hệ.
★ LINH DỊ TRUNG: 鬼→Ma/Quỷ, 厉鬼→Lệ quỷ, 僵尸→Cương thi, 附身→Ma nhập, 驱魔→Trừ tà, 道士→Đạo sĩ, 符咒→Bùa chú, 冤魂→Oan hồn, 诅咒→Lời nguyền, 阴气→Âm khí, 因果报应→Nhân quả báo ứng.
★ KINH DỊ ÂU MỸ: 恶魔→Ác quỷ, 神父→Cha xứ, 附身→Quỷ ám, 丧尸→Zombie, 吸血鬼→Ma cà rồng, 该死→Chết tiệt, 上帝啊→Lạy Chúa.
★ TÊN RIÊNG: tên Trung → Hán-Việt; tên Tây/quỷ Tây (Michael, Annabelle, Valak) → giữ nguyên.`,
	},
	{
		id: "anime-animation",
		name: "🎌 Anime / Hoạt hình",
		prompt: `BỐI CẢNH: ANIME / HOẠT HÌNH (Nhật, donghua Trung, Hàn).
★ XƯNG HÔ: học đường/đồng đội → tớ/cậu; chiến đấu/kẻ thù → tao/mày hoặc ta/ngươi; donghua cổ trang/tu tiên → ta/ngươi/hắn/nàng, Sư phụ.
★ KÍNH NGỮ NHẬT GIỮ: Senpai (Tiền bối), Sensei (Thầy), Sama (Ngài), Aniki (Đại ca), Ojou-sama (Tiểu thư); KHÔNG thêm từ đệm Nhật vào bản dịch.
★ TÊN RIÊNG THEO GỐC: tên Nhật → giữ Romaji, KHÔNG Hán-Việt hóa; tên Trung donghua → Hán-Việt; tên Hàn → giữ Latin; chiêu thức tiếng Anh → giữ nguyên.
★ GIỌNG ĐIỆU: đời thường → nhẹ nhàng; shounen/chiến đấu → dứt khoát, máu lửa.`,
	},
	{
		id: "korean-drama",
		name: "Phim Hàn Quốc",
		prompt: `BỐI CẢNH: phim HÀN QUỐC — drama, tình cảm, xã hội.
★ KÍNH NGỮ LÀ TÍN HIỆU QUAN HỆ: -요/-습니다 (kính) → thêm “ạ/dạ”, xưng khiêm; 반말 banmal → bỏ “ạ”. Giữ đúng từng lần chuyển kính ↔ thân.
★ DANH XƯNG: Sunbae→Tiền bối; 회장→Chủ tịch; giữ Giám đốc, Trưởng phòng; xã hội/giang hồ → đại ca, tao/mày.
★ TÊN RIÊNG: TUYỆT ĐỐI KHÔNG phiên Hán-Việt — giữ Latin (Lee Min Ho, Park); địa danh giữ nguyên (Seoul, Gangnam).
★ GIỌNG ĐIỆU: lãng mạn, drama hoặc gay gắt tùy cảnh.
★ LƯU Ý ASR: đuôi câu tiếng Hàn (yo, sum-ni-da) có thể bị nhận nhầm thành từ vô nghĩa → bỏ qua, dịch theo nghĩa chính.`,
	},
	{
		id: "western-hollywood",
		name: "Phim Âu Mỹ (Hollywood)",
		prompt: `BỐI CẢNH: phim ÂU MỸ (Hollywood, Netflix) — nguồn thường là bản thuyết minh/phụ đề tiếng Trung của phim gốc.
★ XƯNG HÔ: xã giao tôi/anh/cô; thân thiết tôi/cậu, anh/em; căng thẳng/kẻ thù tao/mày. KHÔNG dùng danh xưng Á Đông (huynh đệ, sư phụ, bệ hạ, ta, ngươi).
★ GIỌNG ĐIỆU: hơi hướm thuyết minh phim ngoại kinh điển — 该死→Chết tiệt, 上帝啊→Lạy Chúa, Buddy→Anh bạn.
★ TÊN RIÊNG: giữ nguyên 100% tên người/địa danh/tổ chức tiếng Anh (John, FBI, New York); TUYỆT ĐỐI KHÔNG phiên âm; giữ từ viết tắt khoa học/quân sự.`,
	},
];

