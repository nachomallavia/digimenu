export type MenuColumns = 1 | 2;
export type MenuNavigation = "scroll_unico" | "por_categorias";

export type MenuLayout = {
	columns: MenuColumns;
	navigation: MenuNavigation;
	showImages: boolean;
};

export const DEFAULT_MENU_LAYOUT: MenuLayout = {
	columns: 1,
	navigation: "por_categorias",
	showImages: true,
};

export function parseMenuLayout(raw: unknown): MenuLayout {
	if (!raw || typeof raw !== "object") return { ...DEFAULT_MENU_LAYOUT };
	const o = raw as Record<string, unknown>;
	const columns = o.columns === 2 ? 2 : 1;
	const navigation: MenuNavigation =
		o.navigation === "scroll_unico" ? "scroll_unico" : "por_categorias";
	const showImages = o.showImages !== false;
	return { columns, navigation, showImages };
}
