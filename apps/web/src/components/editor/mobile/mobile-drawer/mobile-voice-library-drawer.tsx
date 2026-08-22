"use client";

import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { VoiceLibraryView } from "../../panels/assets/views/dubbing";
import { useMobileDrawerStore } from "../hooks/use-mobile-drawer";

export function MobileVoiceLibraryDrawer() {
	const { t } = useTranslation();
	const { activeDrawer, closeDrawer } = useMobileDrawerStore();
	const isOpen = activeDrawer === "voice-library";

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
					<DrawerTitle>{t("Kho Mẫu Giọng")}</DrawerTitle>
				</DrawerHeader>
				<div className="overflow-y-auto px-4 pb-6">
					<VoiceLibraryView />
				</div>
			</DrawerContent>
		</Drawer>
	);
}
