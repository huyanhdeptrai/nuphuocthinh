import { once } from "node:events";
import fs from "node:fs";

export async function concatFiles(parts: string[], destination: string) {
	const expectedSize = parts.reduce(
		(total, part) => total + fs.statSync(part).size,
		0,
	);
	const output = fs.createWriteStream(destination, { flags: "w" });

	try {
		for (const part of parts) {
			const input = fs.createReadStream(part);
			for await (const chunk of input) {
				if (!output.write(chunk)) await once(output, "drain");
			}
		}
	} catch (error) {
		output.destroy();
		throw error;
	}

	await new Promise<void>((resolve, reject) => {
		output.end((error: Error | null | undefined) => {
			if (error) reject(error);
			else resolve();
		});
	});

	if (!fs.existsSync(destination) || fs.statSync(destination).size !== expectedSize) {
		throw new Error("Ghép các phần gói GPU không hoàn tất.");
	}
}
