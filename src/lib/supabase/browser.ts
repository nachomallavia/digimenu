import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
	const url = import.meta.env.PUBLIC_SUPABASE_URL;
	const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) {
		throw new Error("Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY");
	}
	return createBrowserClient(url, key);
}
