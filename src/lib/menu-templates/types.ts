import type {
	EmDashCategoria,
	EmDashMenu,
	EmDashProducto,
	EmDashRestaurante,
	EmDashTag,
} from "../emdash/client";
import type { MenuLayout } from "../menu-layout";
import type { RestaurantTheme } from "../restaurant-theme";

/** Content entry with optional EmDash visual-edit proxies. */
export type EditableRestaurante = EmDashRestaurante & {
	edit?: Record<string, Record<string, unknown>>;
};

export type EditableProducto = EmDashProducto & {
	edit?: Record<string, Record<string, unknown>>;
};

/** Stable props every menu template must accept. */
export type MenuTemplateProps = {
	restaurant: EditableRestaurante;
	/** All menus for the restaurant (switcher). */
	menus: EmDashMenu[];
	/** Menu currently being viewed. */
	activeMenu: EmDashMenu;
	categories: EmDashCategoria[];
	/** Products already filtered to `activeMenu`. */
	products: EditableProducto[];
	/** Tag catalog for the restaurant. */
	tags: EmDashTag[];
	/** product data.id → tag ids */
	productTagIds: Map<string, string[]>;
	theme: RestaurantTheme;
	/**
	 * Legacy display knobs from `restaurantes.menu_layout`.
	 * Only Classic uses them; new templates should ignore.
	 */
	layout?: MenuLayout;
};
