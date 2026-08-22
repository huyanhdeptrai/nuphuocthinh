import { describe, expect, test } from "bun:test";
import { mixIsolatedStems } from "./isolate-mix";

describe("mixIsolatedStems", () => {
	test("full music and vocal reconstructs both stems", () => {
		const vocals = {
			left: new Float32Array([0.2, -0.1]),
			right: new Float32Array([0.1, 0.4]),
		};
		const instrumental = {
			left: new Float32Array([0.3, 0.2]),
			right: new Float32Array([0.05, -0.2]),
		};
		const result = mixIsolatedStems({
			vocals,
			instrumental,
			musicGain: 1,
			vocalGain: 1,
		});

		expect(result.left[0]).toBeCloseTo(0.5, 6);
		expect(result.left[1]).toBeCloseTo(0.1, 6);
		expect(result.right?.[0]).toBeCloseTo(0.15, 6);
		expect(result.right?.[1]).toBeCloseTo(0.2, 6);
	});

	test("vocal 0 is music only", () => {
		const vocals = {
			left: new Float32Array([0.9, 0.8]),
			right: new Float32Array([0.7, 0.6]),
		};
		const instrumental = {
			left: new Float32Array([0.1, -0.2]),
			right: new Float32Array([0.3, 0.4]),
		};
		const result = mixIsolatedStems({
			vocals,
			instrumental,
			musicGain: 1,
			vocalGain: 0,
		});

		expect(Array.from(result.left)).toEqual(Array.from(instrumental.left));
		expect(result.right ? Array.from(result.right) : null).toEqual(
			Array.from(instrumental.right),
		);
	});

	test("music 0 is vocal only", () => {
		const vocals = {
			left: new Float32Array([0.4, 0.5]),
			right: new Float32Array([0.2, 0.1]),
		};
		const instrumental = {
			left: new Float32Array([0.9, 0.8]),
			right: new Float32Array([0.7, 0.6]),
		};
		const result = mixIsolatedStems({
			vocals,
			instrumental,
			musicGain: 0,
			vocalGain: 0.5,
		});
		expect(result.left[0]).toBeCloseTo(0.2, 6);
		expect(result.left[1]).toBeCloseTo(0.25, 6);
		expect(result.right?.[0]).toBeCloseTo(0.1, 6);
	});

	test("output lengths match the shorter stem", () => {
		const result = mixIsolatedStems({
			vocals: {
				left: new Float32Array(8),
				right: new Float32Array(8),
			},
			instrumental: {
				left: new Float32Array(5),
				right: new Float32Array(5),
			},
			musicGain: 1,
			vocalGain: 0.5,
		});
		expect(result.left.length).toBe(5);
		expect(result.right?.length).toBe(5);
	});

	test("does not mutate inputs", () => {
		const vocals = {
			left: new Float32Array([0.4]),
			right: new Float32Array([0.2]),
		};
		const instrumental = {
			left: new Float32Array([0.1]),
			right: new Float32Array([0.3]),
		};
		mixIsolatedStems({
			vocals,
			instrumental,
			musicGain: 1,
			vocalGain: 0.5,
		});
		expect(vocals.left[0]).toBeCloseTo(0.4, 6);
		expect(instrumental.left[0]).toBeCloseTo(0.1, 6);
	});

	test("mono stays mono", () => {
		const result = mixIsolatedStems({
			vocals: { left: new Float32Array([0.2, 0.4]), right: null },
			instrumental: { left: new Float32Array([0.1, 0.1]), right: null },
			musicGain: 1,
			vocalGain: 0.5,
		});
		expect(result.right).toBeNull();
		expect(result.left[0]).toBeCloseTo(0.2, 6);
		expect(result.left[1]).toBeCloseTo(0.3, 6);
	});
});
