"use client";

export function MobilePlayhead() {
	return (
		<div
			className="bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] pointer-events-none absolute top-0 bottom-0 left-1/2 z-30 -translate-x-1/2"
			style={{ width: 2 }}
		>
			{/* Circle indicator at top, matching desktop */}
			<div className="bg-red-500 border-white absolute top-1 left-1/2 size-3.5 -translate-x-1/2 rounded-full border-2 shadow-md" />
		</div>
	);
}
