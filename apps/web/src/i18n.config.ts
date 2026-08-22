import { createI18nConfig } from "@i18next-toolkit/nextjs-approuter";

export const i18nConfig = createI18nConfig({
	// Bản desktop được phát hành chỉ dành cho người dùng Việt Nam. Giữ danh
	// sách này đơn ngữ để Next không dựng route/chunk cho các locale khác.
	locales: ["vi"],
	defaultLocale: "vi",
	localeDir: "./public/locales",
	namespaces: ["translation"],
	routingStrategy: "url-segment",
});
