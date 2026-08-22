"use client";

import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { SettingsView } from "../../panels/assets/views/settings";
import { useMobileDrawerStore } from "../hooks/use-mobile-drawer";

export function MobileSettingsDrawer() {
	const { t } = useTranslation();
	const { activeDrawer, closeDrawer } = useMobileDrawerStore();
	const isOpen = activeDrawer === "settings";

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
					<DrawerTitle>{t("Settings")}</DrawerTitle>
				</DrawerHeader>
				<div className="overflow-y-auto px-2 pb-6">
					<SettingsView />
				</div>
			</DrawerContent>
		</Drawer>
	);
}
