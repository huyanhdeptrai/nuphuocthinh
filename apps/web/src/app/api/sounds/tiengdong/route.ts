import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const query = searchParams.get("q")?.trim() || "";
		const category = searchParams.get("category")?.trim() || "";
		const page = parseInt(searchParams.get("page") || "1", 10);

		let targetUrl: string;

		if (query) {
			targetUrl =
				page > 1
					? `https://tiengdong.com/page/${page}/?s=${encodeURIComponent(query)}`
					: `https://tiengdong.com/?s=${encodeURIComponent(query)}`;
		} else if (category && category !== "all") {
			targetUrl =
				page > 1
					? `https://tiengdong.com/${category}/page/${page}`
					: `https://tiengdong.com/${category}`;
		} else {
			targetUrl = page > 1 ? `https://tiengdong.com/page/${page}` : "https://tiengdong.com/";
		}

		const response = await fetch(targetUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
			},
			next: { revalidate: 300 }, // Cache for 5 minutes
		});

		if (!response.ok) {
			return NextResponse.json(
				{ error: `Tiếng Động returned status: ${response.status}`, results: [] },
				{ status: response.status },
			);
		}

		const html = await response.text();

		const results: {
			id: number;
			name: string;
			previewUrl: string;
			duration: number;
			username: string;
			tags: string[];
			url: string;
		}[] = [];

		// Match audio items
		const itemRegex =
			/<li[^>]*class="[^"]*audio-play-item[^"]*"[^>]*>[\s\S]*?playPauseAudio\s*\(\s*['"][^'"]*['"]\s*,\s*['"]([^'"]+)['"]\s*\)[\s\S]*?<div[^>]*class="[^"]*title-link-col[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

		let match: RegExpExecArray | null;
		let index = 0;
		while ((match = itemRegex.exec(html)) !== null) {
			index++;
			const audioUrl = match[1].trim();
			const pageUrl = match[2].trim();
			const rawTitle = match[3]
				.replace(/<[^>]+>/g, "")
				.replace(/&#8230;/g, "...")
				.replace(/&amp;/g, "&")
				.replace(/&quot;/g, '"')
				.replace(/&#039;/g, "'")
				.trim();

			// Generate stable numeric ID
			let numericId = 9000000 + page * 1000 + index;
			const postMatch = html.slice(Math.max(0, match.index - 50), match.index + 200).match(/data-post-id="(\d+)"/);
			if (postMatch) {
				numericId = parseInt(postMatch[1], 10);
			}

			// Only keep audio files (mp3, wav, ogg, m4a), exclude mp4 videos
			if (!audioUrl.endsWith(".mp4")) {
				results.push({
					id: numericId,
					name: rawTitle,
					previewUrl: audioUrl,
					duration: 3, // fallback duration
					username: "TiếngĐộng.com",
					tags: ["tiengdong", category || "meme"],
					url: pageUrl,
				});
			}
		}

		const hasNext = html.includes(`page/${page + 1}`) || html.includes(`Trang tiếp theo`) || results.length >= 15;

		return NextResponse.json({
			results,
			count: results.length,
			page,
			hasNext,
		});
	} catch (error) {
		console.error("Error in tiengdong search route:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Internal Server Error",
				results: [],
			},
			{ status: 500 },
		);
	}
}
