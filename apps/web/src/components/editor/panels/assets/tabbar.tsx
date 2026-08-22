"use client";

import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import {
	TAB_KEYS,
	tabs,
	useAssetsPanelStore,
} from "@/stores/assets-panel-store";

export function TabBar() {
	const { t } = useTranslation();
	const { activeTab, setActiveTab } = useAssetsPanelStore();

	// i18next-toolkit: forces extraction of tab labels (dead code, extract-only)
	if (false as boolean) {
		t("Media");
		t("Sounds");
		t("Text");
		t("Stickers");
		t("Effects");
		t("Lớp phủ / Xoá");
		t("Transitions");
		t("Nhận Dạng Videos");
		t("Dịch Thuật AI");
		t("Kho Mẫu Giọng");
		t("Thuyết minh");
		t("Filters");
		t("Adjustment");
		t("AI");
		t("Settings");
	}
	const [showTopFade, setShowTopFade] = useState(false);
	const [showBottomFade, setShowBottomFade] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const checkScrollPosition = useCallback(() => {
		const element = scrollRef.current;
		if (!element) return;

		const { scrollTop, scrollHeight, clientHeight } = element;
		setShowTopFade(scrollTop > 0);
		setShowBottomFade(scrollTop < scrollHeight - clientHeight - 1);
	}, []);

	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;

		checkScrollPosition();
		element.addEventListener("scroll", checkScrollPosition);

		const resizeObserver = new ResizeObserver(checkScrollPosition);
		resizeObserver.observe(element);

		return () => {
			element.removeEventListener("scroll", checkScrollPosition);
			resizeObserver.disconnect();
		};
	}, [checkScrollPosition]);

	return (
		<div className="relative flex">
			<div
				ref={scrollRef}
				className="scrollbar-hidden relative flex size-full p-2 flex-col items-center justify-start gap-1.5 overflow-y-auto"
			>
				{TAB_KEYS.map((tabKey) => {
					const tab = tabs[tabKey];
					if (!tab) return null;
					return (
						<Tooltip key={tabKey} delayDuration={10}>
							<TooltipTrigger asChild>
								<Button
									variant={activeTab === tabKey ? "secondary" : "text"}
									aria-label={t(tab.label)}
									className={cn(
										"flex-col !p-1.5 !rounded-sm !h-auto [&_svg]:size-4.5",
										activeTab !== tabKey && "border border-transparent text-muted-foreground",
									)}
									onClick={() => setActiveTab(tabKey)}
								>
									<tab.icon />
								</Button>
							</TooltipTrigger>
							<TooltipContent
								side="right"
								align="center"
								variant="sidebar"
								sideOffset={8}
							>
								<div className="text-foreground text-sm leading-none font-medium">
									{t(tab.label)}
								</div>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
			{showTopFade && (
				<div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-background to-transparent" />
			)}
			{showBottomFade && (
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-background to-transparent" />
			)}
		</div>
	);
}
