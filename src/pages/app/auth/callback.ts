import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { setOwnerSessionCookie, clearOwnerSessionCookie } from "../../../lib/auth/owner-session";
import { getRestauranteById } from "../../../lib/emdash/client";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, redirect, url }) => {
	const code = url.searchParams.get("code");
	const next = url.searchParams.get("next") ?? "/app";

	if (!code) {
		return redirect("/app/login?error=auth");
	}

	const supabase = createSupabaseServerClient(request, cookies);
	const { error } = await supabase.auth.exchangeCodeForSession(code);

	if (error) {
		console.error("[auth/callback]", error.message);
		return redirect("/app/login?error=auth");
	}

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return redirect("/app/login?error=auth");
	}

	const { data: restaurant, error: mapError } = await supabase
		.from("owner_restaurants")
		.select("user_id, emdash_restaurant_id, emdash_restaurant_slug, created_at")
		.eq("user_id", user.id)
		.maybeSingle();

	if (mapError) {
		console.error("[auth/callback] mapping lookup failed", mapError.message);
		clearOwnerSessionCookie(cookies);
		return redirect("/app/pending?error=lookup");
	}

	if (!restaurant) {
		clearOwnerSessionCookie(cookies);
		return redirect("/app/pending");
	}

	let restaurantName = restaurant.emdash_restaurant_slug;
	try {
		const { entry } = await getRestauranteById(restaurant.emdash_restaurant_slug);
		if (entry?.data.nombre) restaurantName = entry.data.nombre;
	} catch {
		// keep slug as display fallback
	}

	await setOwnerSessionCookie(cookies, {
		userId: user.id,
		email: user.email,
		restaurantId: restaurant.emdash_restaurant_id,
		restaurantSlug: restaurant.emdash_restaurant_slug,
		restaurantName,
	});

	return redirect(next.startsWith("/") ? next : "/app");
};
