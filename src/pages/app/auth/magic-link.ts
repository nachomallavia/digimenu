import type { APIRoute } from "astro";
import { getOwnerAuthCallbackUrl } from "../../../lib/auth/site-url";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const email = String(form.get("email") ?? "")
		.trim()
		.toLowerCase();

	if (!email) {
		return redirect("/app/login?error=auth");
	}

	const supabase = createSupabaseServerClient(request, cookies);
	const emailRedirectTo = getOwnerAuthCallbackUrl(request);
	const { error } = await supabase.auth.signInWithOtp({
		email,
		options: {
			emailRedirectTo,
		},
	});

	if (error) {
		console.error("[magic-link]", error.message);
		return redirect("/app/login?error=auth");
	}

	return redirect("/app/login?sent=1");
};
