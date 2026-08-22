"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X, Sparkles, Type } from "lucide-react";
import {
	FONT_CATEGORIES,
	FONT_OPTIONS,
	type FontCategory,
	type FontFamily,
	type FontOption,
	getFontByValue,
	searchFonts,
} from "@/constants/font-constants";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ensureFontLoaded, injectGoogleFontsStylesheets } from "@/utils/font-loader";
import { cn } from "@/utils/ui";

interface FontPickerProps {
	value?: FontFamily;
	defaultValue?: FontFamily;
	onValueChange?: (value: FontFamily) => void;
	className?: string;
	placeholder?: string;
}

export function FontPicker({
	value: propValue,
	defaultValue = "Arial",
	onValueChange,
	className,
	placeholder = "Chọn phông chữ",
}: FontPickerProps) {
	const [isOpen, setIsOpen] = React.useState(false);
	const [internalValue, setInternalValue] = React.useState<string>(
		propValue || defaultValue || "Arial",
	);
	const [searchQuery, setSearchQuery] = React.useState("");
	const [selectedCategory, setSelectedCategory] = React.useState<FontCategory>("all");
	const listContainerRef = React.useRef<HTMLDivElement>(null);
	const searchInputRef = React.useRef<HTMLInputElement>(null);

	// Sync controlled value
	React.useEffect(() => {
		if (propValue !== undefined) {
			setInternalValue(propValue);
		}
	}, [propValue]);

	// Inject fonts stylesheet on mount
	React.useEffect(() => {
		injectGoogleFontsStylesheets();
	}, []);

	// Focus search on open
	React.useEffect(() => {
		if (isOpen) {
			setTimeout(() => {
				searchInputRef.current?.focus();
			}, 50);
		} else {
			setSearchQuery("");
		}
	}, [isOpen]);

	const currentValue = propValue !== undefined ? propValue : internalValue;
	const selectedFont = getFontByValue(currentValue) || {
		value: currentValue,
		label: currentValue,
		category: "custom" as const,
		fontType: "sans" as const,
	};

	const filteredFonts = React.useMemo(() => {
		return searchFonts(searchQuery, selectedCategory);
	}, [searchQuery, selectedCategory]);

	const handleSelectFont = (font: FontOption) => {
		setInternalValue(font.value);
		onValueChange?.(font.value);
		ensureFontLoaded(font.value);
		setIsOpen(false);
	};

	const getBadgeLabel = (type: FontOption["fontType"]) => {
		switch (type) {
			case "sans":
				return "Phổ biến";
			case "display":
				return "TikTok / Đậm";
			case "handwriting":
				return "Viết tay";
			case "serif":
				return "Có chân";
			case "system":
				return "Hệ thống";
			default:
				return "";
		}
	};

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"bg-accent ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm focus:ring-1 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
						"focus:border-primary focus:ring-4 focus:ring-primary/10 border border-transparent transition-all",
						className,
					)}
				>
					<div className="flex items-center gap-2 overflow-hidden">
						<Type className="size-4 shrink-0 text-muted-foreground" />
						<span
							className="truncate text-foreground font-medium"
							style={{ fontFamily: selectedFont.value }}
						>
							{selectedFont.label}
						</span>
					</div>
					<ChevronDown className="size-4 shrink-0 opacity-50 transition-transform duration-200" />
				</button>
			</PopoverTrigger>

			<PopoverContent
				align="start"
				className="z-70 w-[380px] p-0 shadow-2xl rounded-xl border bg-popover text-popover-foreground overflow-hidden"
			>
				{/* Search header */}
				<div className="p-3 pb-2 border-b bg-muted/30">
					<div className="relative flex items-center">
						<Search className="absolute left-2.5 size-4 text-muted-foreground pointer-events-none" />
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Tìm theo tên font tiếng Việt..."
							className="w-full bg-background pl-8 pr-8 py-1.5 text-xs rounded-lg border border-input focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => setSearchQuery("")}
								className="absolute right-2 p-0.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
							>
								<X className="size-3.5" />
							</button>
						)}
					</div>

					{/* Category filter pills */}
					<div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
						{FONT_CATEGORIES.map((cat) => {
							const isActive = selectedCategory === cat.id;
							return (
								<button
									key={cat.id}
									type="button"
									onClick={() => setSelectedCategory(cat.id)}
									className={cn(
										"px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer shrink-0",
										isActive
											? "bg-primary text-primary-foreground shadow-xs"
											: "bg-background hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60",
									)}
								>
									{cat.labelVi}
								</button>
							);
						})}
					</div>
				</div>

				{/* Font items list */}
				<div
					ref={listContainerRef}
					className="max-h-[300px] overflow-y-auto p-1.5 space-y-1 divide-y divide-border/20"
				>
					{filteredFonts.length === 0 ? (
						<div className="py-8 text-center text-xs text-muted-foreground">
							Không tìm thấy phông chữ nào phù hợp
						</div>
					) : (
						filteredFonts.map((font) => {
							const isSelected =
								font.value.toLowerCase() === currentValue.toLowerCase();
							return (
								<button
									key={font.value}
									type="button"
									onClick={() => handleSelectFont(font)}
									onMouseEnter={() => ensureFontLoaded(font.value)}
									className={cn(
										"w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between gap-3 group cursor-pointer",
										isSelected
											? "bg-primary/10 text-primary border border-primary/20"
											: "hover:bg-accent/80 text-foreground",
									)}
								>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span
												className="font-medium text-sm truncate"
												style={{ fontFamily: font.value }}
											>
												{font.label}
											</span>
											<span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground font-normal shrink-0">
												{getBadgeLabel(font.fontType)}
											</span>
											{font.vietnamese && (
												<span className="text-[9px] px-1 py-0.2 rounded font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
													VN
												</span>
											)}
										</div>
										<p
											className="text-xs text-muted-foreground truncate mt-0.5"
											style={{ fontFamily: font.value }}
										>
											{font.previewText || "Xin chào Việt Nam 123"}
										</p>
									</div>

									{isSelected && (
										<div className="size-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0 shadow-xs">
											<Check className="size-3 stroke-[3]" />
										</div>
									)}
								</button>
							);
						})
					)}
				</div>

				{/* Footer info */}
				<div className="p-2 px-3 border-t bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
					<span>Tổng cộng {filteredFonts.length} phông chữ</span>
					<span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
						<Sparkles className="size-3" /> Chuẩn dấu Tiếng Việt
					</span>
				</div>
			</PopoverContent>
		</Popover>
	);
}
