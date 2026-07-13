import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";

export function createSupabaseServerClient(request: Request, cookies: AstroCookies) {
	const url = import.meta.env.PUBLIC_SUPABASE_URL;
	const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) {
		throw new Error("Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY");
	}

	return createServerClient(url, key, {
		cookies: {
			getAll() {
				return parseCookieHeader(request.headers.get("Cookie") ?? "").map(({ name, value }) => ({
					name,
					value: value ?? "",
				}));
			},
			setAll(cookiesToSet) {
				for (const { name, value, options } of cookiesToSet) {
					cookies.set(name, value, options);
				}
			},
		},
	});
}
