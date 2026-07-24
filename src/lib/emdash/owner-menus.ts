import type { EmDashMenu } from "../emdash/client";
import { listMenusForRestaurant } from "../emdash/client";

/** First menu by orden, or null if none. */
export async function getDefaultMenuForRestaurant(
	restaurantId: string,
): Promise<EmDashMenu | null> {
	try {
		const { entries } = await listMenusForRestaurant(restaurantId);
		return entries[0] ?? null;
	} catch {
		return null;
	}
}

export function menuPathId(menu: EmDashMenu): string {
	return menu.slug ?? menu.id;
}
