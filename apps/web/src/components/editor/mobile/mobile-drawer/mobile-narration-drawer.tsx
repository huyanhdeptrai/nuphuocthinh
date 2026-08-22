"use client";

import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { NarrationView } from "../../panels/assets/views/dubbing";
import { useMobileDrawerStore } from "../hooks/use-mobile-drawer";

export function MobileNarrationDrawer() {
	const { t } = useTranslation();
	const { activeDrawer, closeDrawer } = useMobileDrawerStore();
	const isOpen = activeDrawer === "narration";

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
					<DrawerTitle>{t("Thuyết minh")}</DrawerTitle>
				</DrawerHeader>
				<div className="overflow-y-auto px-4 pb-6">
					<NarrationView />
				</div>
			</DrawerContent>
		</Drawer>
	);
}
