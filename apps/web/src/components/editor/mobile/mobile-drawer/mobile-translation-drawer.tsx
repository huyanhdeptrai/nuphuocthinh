"use client";

import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { TranslationView } from "../../panels/assets/views/dubbing";
import { useMobileDrawerStore } from "../hooks/use-mobile-drawer";

export function MobileTranslationDrawer() {
	const { t } = useTranslation();
	const { activeDrawer, closeDrawer } = useMobileDrawerStore();
	const isOpen = activeDrawer === "translation";

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) closeDrawer();
			}}
			shouldScaleBackground={false}
		>
			<DrawerContent className="max-h-[80vh]">
				<DrawerHeader>
					<DrawerTitle>{t("Dịch Thuật AI")}</DrawerTitle>
				</DrawerHeader>
				<div className="overflow-y-auto px-4 pb-6">
					<TranslationView />
				</div>
			</DrawerContent>
		</Drawer>
	);
}
