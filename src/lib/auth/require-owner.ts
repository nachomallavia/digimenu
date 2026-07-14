import type { AstroCookies } from "astro";
import { getRestauranteById } from "../emdash/client";
import {
	readOwnerSessionCookie,
	setOwnerSessionCookie,
} from "./owner-session";

export type OwnerRestaurant = {
	user_id: string;
	emdash_restaurant_id: string;
	emdash_restaurant_slug: string;
	created_at: string;
};

export type OwnerContext = {
	userId: string;
	email: string | undefined;
	restaurant: OwnerRestaurant;
	/** Display name from EmDash / session cookie */
	restaurantName: string;
};

type RedirectResult = { ok: false; redirect: string };
type OkResult = { ok: true; owner: OwnerContext };
export type RequireOwnerResult = RedirectResult | OkResult;

async function resolveRestaurantFromSlug(slug: string): Promise<{
	id: string | null;
	name: string;
}> {
	try {
		const { entry } = await getRestauranteById(slug);
		if (!entry) return { id: null, name: slug };
		return {
			id: entry.data.id ?? null,
			name: entry.data.nombre ?? slug,
		};
	} catch {
		return { id: null, name: slug };
	}
}

export async function buildOwnerContextFromSupabase(
	request: Request,
	cookies: AstroCookies,
): Promise<RequireOwnerResult> {
	const { createSupabaseServerClient } = await import("../supabase/server");
	const supabase = createSupabaseServerClient(request, cookies);

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return { ok: false, redirect: "/app/login" };
	}

	const { data: restaurant, error } = await supabase
		.from("owner_restaurants")
		.select("user_id, emdash_restaurant_id, emdash_restaurant_slug, created_at")
		.eq("user_id", user.id)
		.maybeSingle();

	if (error) {
		console.error("[requireOwner] mapping lookup failed", error.message);
		return { ok: false, redirect: "/app/pending?error=lookup" };
	}

	if (!restaurant) {
		return { ok: false, redirect: "/app/pending" };
	}

	const row = restaurant as OwnerRestaurant;
	// Resolve ULID from this environment's EmDash (local vs Worker IDs differ).
	const resolved = await resolveRestaurantFromSlug(row.emdash_restaurant_slug);
	const restaurantId = resolved.id ?? row.emdash_restaurant_id;
	const restaurantName = resolved.name;

	const owner: OwnerContext = {
		userId: user.id,
		email: user.email,
		restaurant: {
			...row,
			emdash_restaurant_id: restaurantId,
		},
		restaurantName,
	};

	await setOwnerSessionCookie(cookies, {
		userId: owner.userId,
		email: owner.email,
		restaurantId,
		restaurantSlug: row.emdash_restaurant_slug,
		restaurantName,
	});

	return { ok: true, owner };
}

/**
 * Resolve owner from DigiMenu session cookie when possible.
 * Trusts cookie fields (no EmDash/Supabase) so sidebar navigations stay light.
 * ULID/name refresh happens only in buildOwnerContextFromSupabase (login + revalidate).
 */
export async function requireOwner(
	request: Request,
	cookies: AstroCookies,
): Promise<RequireOwnerResult> {
	const session = await readOwnerSessionCookie(cookies);
	if (session) {
		return {
			ok: true,
			owner: {
				userId: session.userId,
				email: session.email,
				restaurantName: session.restaurantName,
				restaurant: {
					user_id: session.userId,
					emdash_restaurant_id: session.restaurantId,
					emdash_restaurant_slug: session.restaurantSlug,
					created_at: "",
				},
			},
		};
	}
	return buildOwnerContextFromSupabase(request, cookies);
}

/**
 * Revalidate Supabase auth + mapping + restaurant name, refresh cookie (3d TTL).
 * Call after successful owner POSTs / BFF mutations.
 */
export async function revalidateOwnerSession(
	request: Request,
	cookies: AstroCookies,
): Promise<RequireOwnerResult> {
	return buildOwnerContextFromSupabase(request, cookies);
}
