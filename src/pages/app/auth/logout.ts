import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { clearOwnerSessionCookie } from "../../../lib/auth/owner-session";

export const prerender = false;

async function logout({ request, cookies, redirect }: Parameters<APIRoute>[0]) {
	clearOwnerSessionCookie(cookies);
	const supabase = createSupabaseServerClient(request, cookies);
	await supabase.auth.signOut();
	return redirect("/app/login");
}

export const POST: APIRoute = logout;
export const GET: APIRoute = logout;
