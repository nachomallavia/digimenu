import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

export default {
	hooks: {
		"content:beforeSave": {
			handler: async (event, ctx: PluginContext) => {
				const { content, collection, isNew } = event;

				if (collection !== "productos" || !isNew) {
					return;
				}

				if (content.restaurante) {
					return;
				}

				if (!ctx.content) {
					throw new Error("DigiMenu autofill: content API unavailable");
				}

				const { items } = await ctx.content.list("restaurantes", {
					limit: 2,
					where: { status: "published" },
				});

				if (items.length === 1) {
					content.restaurante = items[0].id;
					return content;
				}

				if (items.length === 0) {
					throw new Error(
						"DigiMenu: no hay restaurantes publicados. Creá uno antes de agregar productos.",
					);
				}

				throw new Error(
					"DigiMenu: hay varios restaurantes. Elegí el restaurante del producto (o vinculá tu usuario a uno).",
				);
			},
		},
	},
} satisfies SandboxedPlugin;
