import { describe, expect, test } from "bun:test";
import { TAB_KEYS, tabs } from "@/stores/assets-panel-store";

describe("assets-panel-store tab integrity (overlays wiring)", () => {
	test("every TAB_KEYS entry has a matching tabs entry with a label", () => {
		for (const key of TAB_KEYS) {
			expect(tabs[key], `tabs.${key} must exist`).toBeDefined();
			expect(typeof tabs[key].label, `tabs.${key}.label must be a string`).toBe(
				"string",
			);
			expect(
				tabs[key].label.length,
				`tabs.${key}.label must be non-empty`,
			).toBeGreaterThan(0);
		}
	});

	test("the overlays tab is registered with the Lớp phủ panel label", () => {
		expect(TAB_KEYS).toContain("overlays");
		expect(tabs.overlays.label).toBe("Lớp phủ");
		expect(tabs.overlays.icon).toBeDefined();
	});
});
