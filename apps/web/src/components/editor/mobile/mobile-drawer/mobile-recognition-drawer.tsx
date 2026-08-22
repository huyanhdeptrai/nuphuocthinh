"use client";

import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { RecognitionView } from "../../panels/assets/views/dubbing";
import { useMobileDrawerStore } from "../hooks/use-mobile-drawer";

export function MobileRecognitionDrawer() {
	const { t } = useTranslation();
	const { activeDrawer, closeDrawer } = useMobileDrawerStore();
	const isOpen = activeDrawer === "recognition";

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
					<DrawerTitle>{t("Nhận Dạng Videos")}</DrawerTitle>
				</DrawerHeader>
				<div className="overflow-y-auto px-4 pb-6">
					<RecognitionView />
				</div>
			</DrawerContent>
		</Drawer>
	);
}
