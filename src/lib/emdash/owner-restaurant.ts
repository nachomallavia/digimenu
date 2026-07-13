import type { OwnerContext } from "../auth/require-owner";
import { getRestauranteById, type EmDashRestaurante } from "./client";
import { emdashJson, getEmDashApiConfig } from "./api";

export type OwnerRestaurantView = {
	slug: string;
	name: string;
	entry: EmDashRestaurante | null;
};

/**
 * Load restaurant for owner pages.
 *
 * - `chromeOnly`: use session cookie fields (no EmDash) — for sidebar/header on light pages.
 * - default: in-process EmDash entry (info/menu/estilos need fields).
 * - `preferApi`: HTTP API path (rare).
 */
export async function loadOwnerRestaurant(
	owner: OwnerContext,
	opts: { preferApi?: boolean; chromeOnly?: boolean } = {},
): Promise<OwnerRestaurantView> {
	const slug = owner.restaurant.emdash_restaurant_slug;
	const id = owner.restaurant.emdash_restaurant_id;
	const name = owner.restaurantName || slug;

	if (opts.chromeOnly) {
		return { slug, name, entry: null };
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
