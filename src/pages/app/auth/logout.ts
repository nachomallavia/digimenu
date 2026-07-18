import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { clearOwnerSessionCookie } from "../../../lib/auth/owner-session";

export const prerender = false;

// POST only: a GET logout is trivially CSRF-able (e.g. <img src="/app/auth/logout">).
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	clearOwnerSessionCookie(cookies);
	const supabase = createSupabaseServerClient(request, cookies);
	await supabase.auth.signOut();
	return redirect("/app/login");
};
