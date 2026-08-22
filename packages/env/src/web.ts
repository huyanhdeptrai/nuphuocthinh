import { z } from "zod";

const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),

	// Server
	DATABASE_URL: z
		.string()
		.startsWith("postgres://")
		.or(z.string().startsWith("postgresql://"))
		.optional(),

	BETTER_AUTH_SECRET: z.string().optional(),
	UPSTASH_REDIS_REST_URL: z.union([z.url(), z.literal("")]).optional(),
	UPSTASH_REDIS_REST_TOKEN: z.union([z.string(), z.literal("")]).optional(),
	FREESOUND_CLIENT_ID: z.string().optional(),
	FREESOUND_API_KEY: z.string().optional(),

	// Cloudflare R2
	R2_ACCOUNT_ID: z.string().optional(),
	R2_ACCESS_KEY_ID: z.string().optional(),
	R2_SECRET_ACCESS_KEY: z.string().optional(),
	R2_BUCKET_NAME: z.string().optional(),
	R2_PUBLIC_URL: z.string().optional(),

	// GPU runtime pack (GitHub Releases manifest, or R2 public URL)
	EDITKUB_GPU_MANIFEST_URL: z.union([z.url(), z.literal("")]).optional(),
	// Backwards compatible with builds/configuration created before the Editkub rename.
	LEMYLOI_DICHVIDEO_GPU_MANIFEST_URL: z.union([z.url(), z.literal("")]).optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const webEnv = webEnvSchema.parse(process.env);
