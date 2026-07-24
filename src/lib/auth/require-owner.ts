import type { AstroCookies } from "astro";
import { getRestauranteById, imageSrc, type EmDashRestaurante } from "../emdash/client";
import {
	readOwnerSessionCookie,
	setOwnerSessionCookie,
	type OwnerRestaurantSnapshot,
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
	/** Cached restaurant fields for form GETs (info/menu/estilos) */
	restaurantSnapshot?: OwnerRestaurantSnapshot;
};

type RedirectResult = { ok: false; redirect: string };
type OkResult = { ok: true; owner: OwnerContext };
export type RequireOwnerResult = RedirectResult | OkResult;

function snapshotLogo(
	image: EmDashRestaurante["data"]["logo_light"],
): OwnerRestaurantSnapshot["logo_light"] {
	const src = imageSrc(image);
	return src ? { src, alt: image?.alt } : null;
}

export function restaurantSnapshotFromEntry(
	entry: EmDashRestaurante | null | undefined,
	fallbackName: string,
): OwnerRestaurantSnapshot {
	return {
		nombre: entry?.data.nombre ?? fallbackName,
		descripcion: entry?.data.descripcion ?? null,
		menu_layout: entry?.data.menu_layout,
		theme: entry?.data.theme,
		logo_light: snapshotLogo(entry?.data.logo_light),
		logo_dark: snapshotLogo(entry?.data.logo_dark),
	};
}

async function loadRestaurantEntry(slug: string): Promise<EmDashRestaurante | null> {
	try {
		const { entry } = await getRestauranteById(slug);
		return entry;
	} catch {
		return null;
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
	// Resolve ULID + snapshot from this environment's EmDash (local vs Worker IDs differ).
	const entry = await loadRestaurantEntry(row.emdash_restaurant_slug);
	const restaurantId = entry?.data.id ?? row.emdash_restaurant_id;
	const restaurantName = entry?.data.nombre ?? row.emdash_restaurant_slug;
	const restaurantSnapshot = restaurantSnapshotFromEntry(entry, restaurantName);

	const owner: OwnerContext = {
		userId: user.id,
		email: user.email,
		restaurant: {
			...row,
			emdash_restaurant_id: restaurantId,
		},
		restaurantName,
		restaurantSnapshot,
	};

	await setOwnerSessionCookie(cookies, {
		userId: owner.userId,
		email: owner.email,
		restaurantId,
		restaurantSlug: row.emdash_restaurant_slug,
		restaurantName,
		restaurantSnapshot,
	});

	return { ok: true, owner };
}

/**
 * Resolve owner from DigiMenu session cookie when possible.
 * Trusts cookie fields (no EmDash/Supabase) so sidebar navigations stay light.
 * ULID/name/snapshot refresh happens only in buildOwnerContextFromSupabase (login + revalidate).
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
				restaurantSnapshot: session.restaurantSnapshot,
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
 * Refresh the session cookie after a restaurant mutation using the data we
 * just wrote — zero extra requests (no Supabase / EmDash round trip).
 * Only needed when the mutation touches snapshot fields
 * (nombre / descripcion / menu_layout / theme); product and category
 * mutations don't affect the cookie at all.
 */
export async function refreshOwnerSnapshot(
	cookies: AstroCookies,
	owner: OwnerContext,
	patch: Partial<OwnerRestaurantSnapshot>,
): Promise<void> {
	const current: OwnerRestaurantSnapshot =
		owner.restaurantSnapshot ?? { nombre: owner.restaurantName };
	const snapshot: OwnerRestaurantSnapshot = { ...current, ...patch };
	const restaurantName = snapshot.nombre || owner.restaurantName;

	await setOwnerSessionCookie(cookies, {
		userId: owner.userId,
		email: owner.email,
		restaurantId: owner.restaurant.emdash_restaurant_id,
		restaurantSlug: owner.restaurant.emdash_restaurant_slug,
		restaurantName,
		restaurantSnapshot: snapshot,
	});
}
