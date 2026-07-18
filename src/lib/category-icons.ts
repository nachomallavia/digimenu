/** Curated Tabler outline icon ids for category pickers. */
export const CATEGORY_ICON_OPTIONS = [
	{ id: "coffee", label: "Café" },
	{ id: "cup", label: "Taza" },
	{ id: "glass-full", label: "Copa" },
	{ id: "beer", label: "Cerveza" },
	{ id: "bottle", label: "Botella" },
	{ id: "pizza", label: "Pizza" },
	{ id: "salad", label: "Ensalada" },
	{ id: "meat", label: "Carne" },
	{ id: "fish", label: "Pescado" },
	{ id: "soup", label: "Sopa" },
	{ id: "bread", label: "Pan" },
	{ id: "cake", label: "Postre" },
	{ id: "ice-cream", label: "Helado" },
	{ id: "apple", label: "Fruta" },
	{ id: "carrot", label: "Verdura" },
	{ id: "egg", label: "Huevo" },
	{ id: "leaf", label: "Veggie" },
	{ id: "flame", label: "Picante" },
	{ id: "star", label: "Destacado" },
	{ id: "tools-kitchen-2", label: "Cocina" },
] as const;

export type CategoryIconId = (typeof CATEGORY_ICON_OPTIONS)[number]["id"];

const ICON_IDS = new Set<string>(CATEGORY_ICON_OPTIONS.map((o) => o.id));

export function isCategoryIconId(value: string): value is CategoryIconId {
	return ICON_IDS.has(value);
}
