import type { AstroCookies } from "astro";
import type { OwnerContext } from "../auth/require-owner";
import { restaurantSnapshotFromEntry } from "../auth/require-owner";
import {
	setOwnerSessionCookie,
	type OwnerRestaurantSnapshot,
} from "../auth/owner-session";
import { getRestauranteById, type EmDashRestaurante } from "./client";
import { emdashJson, getEmDashApiConfig } from "./api";

export type OwnerRestaurantView = {
	slug: string;
	name: string;
	entry: EmDashRestaurante | null;
};

function entryFromSnapshot(
	owner: OwnerContext,
	snapshot: OwnerRestaurantSnapshot,
): EmDashRestaurante {
	const slug = owner.restaurant.emdash_restaurant_slug;
	return {
		id: slug,
		slug,
		status: "published",
		data: {
			id: owner.restaurant.emdash_restaurant_id,
			nombre: snapshot.nombre,
			descripcion: snapshot.descripcion ?? undefined,
			menu_layout: snapshot.menu_layout,
			theme: snapshot.theme,
			logo: snapshot.logo ? { src: snapshot.logo.src, alt: snapshot.logo.alt } : undefined,
		},
	};
}

/**
 * Load restaurant for owner pages.
 *
 * - `chromeOnly`: use session cookie fields (no EmDash) — for sidebar/header on light pages.
 * - `fromSession`: synthesize entry from cookie snapshot (info/menu/estilos GETs).
 *   If snapshot missing, one EmDash read + cookie upgrade (when `cookies` passed).
 * - `requireLogo` (with `fromSession`): snapshots from pre-logo cookies don't know
 *   the logo — fall back to the EmDash read + cookie upgrade in that case.
 * - default: in-process EmDash entry.
 * - `preferApi`: HTTP API path (rare).
 */
export async function loadOwnerRestaurant(
	owner: OwnerContext,
	opts: {
		preferApi?: boolean;
		chromeOnly?: boolean;
		fromSession?: boolean;
		requireLogo?: boolean;
		cookies?: AstroCookies;
	} = {},
): Promise<OwnerRestaurantView> {
	const slug = owner.restaurant.emdash_restaurant_slug;
	const id = owner.restaurant.emdash_restaurant_id;
	const name = owner.restaurantName || slug;

	if (opts.chromeOnly) {
		return { slug, name, entry: null };
	}

	if (opts.fromSession) {
		const cached = owner.restaurantSnapshot;
		const cachedUsable = cached && (!opts.requireLogo || cached.logo !== undefined);
		if (cachedUsable) {
			const entry = entryFromSnapshot(owner, cached);
			return {
				slug,
				name: entry.data.nombre || name,
				entry,
			};
		}

		const { entry } = await getRestauranteById(slug);
		const restaurantName = entry?.data.nombre ?? name;
		const snapshot = restaurantSnapshotFromEntry(entry, restaurantName);

		if (opts.cookies) {
			await setOwnerSessionCookie(opts.cookies, {
				userId: owner.userId,
				email: owner.email,
				restaurantId: entry?.data.id ?? id,
				restaurantSlug: slug,
				restaurantName,
				restaurantSnapshot: snapshot,
			});
		}

		return {
			slug,
			name: restaurantName,
			entry,
		};
	}

	if (opts.preferApi && getEmDashApiConfig()) {
		try {
			const res = await emdashJson<{
				item: {
					id: string;
					slug: string | null;
					status: string;
					data: EmDashRestaurante["data"] & { id?: string };
				};
			}>(`/_emdash/api/content/restaurantes/${encodeURIComponent(id)}`);

			const data = {
				...res.item.data,
				id: res.item.data.id ?? res.item.id,
			};
			const entry: EmDashRestaurante = {
				id: res.item.slug ?? slug,
				slug: res.item.slug,
				status: res.item.status,
				data,
			};
			return {
				slug: res.item.slug ?? slug,
				name: typeof data.nombre === "string" ? data.nombre : name,
				entry,
			};
		} catch {
			// Fall through to in-process read.
		}
	}

	const { entry } = await getRestauranteById(slug);
	return {
		slug,
		name: entry?.data.nombre ?? name,
		entry,
	};
}

/** Post/Redirect/Get helper for owner forms. */
export function savedRedirect(path: string, extra: Record<string, string> = {}) {
	const url = new URL(path, "http://local");
	url.searchParams.set("saved", "1");
	for (const [k, v] of Object.entries(extra)) {
		url.searchParams.set(k, v);
	}
	return `${url.pathname}?${url.searchParams.toString()}`;
}
