import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

export default {
	hooks: {
		"content:beforeSave": {
			handler: async (event, ctx: PluginContext) => {
				const { content, collection, isNew } = event;

				if (collection !== "productos" || !isNew) {
					return;
				}

				if (!ctx.content) {
					throw new Error("DigiMenu autofill: content API unavailable");
				}

				// Auto-assign restaurant when empty (single published restaurant).
				if (!content.restaurante) {
					const { items } = await ctx.content.list("restaurantes", {
						limit: 2,
						where: { status: "published" },
					});

					if (items.length === 1) {
						content.restaurante = items[0].id;
					} else if (items.length === 0) {
						throw new Error(
							"DigiMenu: no hay restaurantes publicados. Creá uno antes de agregar productos.",
						);
					} else {
						throw new Error(
							"DigiMenu: hay varios restaurantes. Elegí el restaurante del producto (o vinculá tu usuario a uno).",
						);
					}
				}

				// Auto-assign the sole restaurant menu when menus is empty.
				const menusRaw = content.menus;
				const hasMenus =
					Array.isArray(menusRaw) &&
					menusRaw.some((id) => typeof id === "string" && id.length > 0);

				if (!hasMenus && content.restaurante) {
					try {
						const { items: menuItems } = await ctx.content.list("menus", {
							limit: 2,
							where: {
								status: "published",
								restaurante: content.restaurante as string,
							},
						});
						if (menuItems.length === 1) {
							content.menus = [menuItems[0].id];
						}
					} catch {
						// Collection may not exist yet during migrations.
					}
				}

				if (content.tags === undefined) {
					content.tags = [];
				}

				return content;
			},
		},
	},
} satisfies SandboxedPlugin;
