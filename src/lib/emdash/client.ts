import { getEmDashCollection, getEmDashEntry, getEntryTerms, getTaxonomyTerms } from "emdash";
import { emdashJson, getEmDashApiConfig, writesEnabled } from "./api";
import { parseMenuLayout, type MenuLayout } from "../menu-layout";
import { parseRestaurantTheme, type RestaurantTheme } from "../restaurant-theme";

export { writesEnabled };

export type EmDashImage = { src: string; alt?: string } | null | undefined;

export type EmDashProducto = {
	id: string;
	slug: string | null;
	status: string;
	data: {
		id: string;
		nombre: string;
		descripcion?: string;
		precio: number;
		imagen?: EmDashImage;
		restaurante?: string;
	};
};

export type EmDashRestaurante = {
	id: string;
	slug: string | null;
	status: string;
	data: {
		id: string;
		nombre: string;
		descripcion?: string;
		logo?: EmDashImage;
		menu_layout?: unknown;
		theme?: unknown;
	};
};

export type CategoriaTerm = {
	id: string;
	slug: string;
	label: string;
};

type ContentApiResponse = {
	item: {
		id: string;
		slug: string | null;
		status: string;
		data: Record<string, unknown>;
		liveRevisionId?: string | null;
		draftRevisionId?: string | null;
	};
	_rev?: string;
};

type TermApiResponse = {
	term?: { id: string; slug: string; label: string };
	id?: string;
	slug?: string;
	label?: string;
};

function requireWrites() {
	if (!getEmDashApiConfig()) {
		throw new Error("EMDASH_API_BASE and EMDASH_API_TOKEN required for writes");
	}
}

/**
 * List productos for a restaurant via in-process EmDash (same Astro app).
 * No PAT required for reads.
 */
export async function listProductosForRestaurant(restaurantId: string) {
	const { entries, cacheHint, error } = await getEmDashCollection("productos", {
		where: { restaurante: restaurantId },
		limit: 200,
	});

	if (error) {
		throw new Error(error.message ?? "Failed to list productos");
	}

	return { entries: entries as EmDashProducto[], cacheHint };
}

export async function getProductoBySlug(slug: string) {
	const { entry, cacheHint, error } = await getEmDashEntry("productos", slug);
	if (error) throw new Error(error.message ?? "Failed to get producto");
	return { entry: entry as EmDashProducto | null, cacheHint };
}

export async function getRestauranteBySlug(slug: string) {
	const { entry, cacheHint, error } = await getEmDashEntry("restaurantes", slug);
	if (error) throw new Error(error.message ?? "Failed to get restaurante");
	return { entry: entry as EmDashRestaurante | null, cacheHint };
}

export async function getRestauranteById(idOrSlug: string) {
	const { entry, cacheHint, error } = await getEmDashEntry("restaurantes", idOrSlug);
	if (error) throw new Error(error.message ?? "Failed to get restaurante");
	return { entry: entry as EmDashRestaurante | null, cacheHint };
}

export function restauranteMenuLayout(entry: EmDashRestaurante): MenuLayout {
	return parseMenuLayout(entry.data.menu_layout);
}

export function restauranteTheme(entry: EmDashRestaurante): RestaurantTheme {
	return parseRestaurantTheme(entry.data.theme);
}

export async function listCategorias() {
	const terms = await getTaxonomyTerms("categoria");
	return terms.map((t) => ({
		id: t.id,
		slug: t.slug,
		label: t.label,
	})) as CategoriaTerm[];
}

export async function getProductoCategorias(productoUlid: string) {
	const terms = await getEntryTerms("productos", productoUlid, "categoria");
	return terms.map((t) => ({
		id: t.id,
		slug: t.slug,
		label: t.label,
	})) as CategoriaTerm[];
}

async function getContentRev(collection: string, id: string): Promise<string | undefined> {
	const res = await emdashJson<ContentApiResponse>(
		`/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
	);
	return res._rev;
}

async function publishContent(collection: string, id: string) {
	try {
		await emdashJson(
			`/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/publish`,
			{ method: "POST", body: "{}" },
		);
	} catch {
		// Already published / no draft — ignore.
	}
}

export async function createProductoViaApi(input: {
	nombre: string;
	precio: number;
	descripcion?: string;
	restauranteId: string;
	slug?: string;
}) {
	requireWrites();
	const created = await emdashJson<ContentApiResponse>("/_emdash/api/content/productos", {
		method: "POST",
		body: JSON.stringify({
			slug: input.slug,
			status: "published",
			data: {
				nombre: input.nombre,
				precio: input.precio,
				descripcion: input.descripcion,
				restaurante: input.restauranteId,
			},
		}),
	});
	if (created.item?.id) {
		await publishContent("productos", created.item.id);
	}
	return created;
}

export async function updateProductoViaApi(
	id: string,
	data: {
		nombre?: string;
		precio?: number;
		descripcion?: string | null;
	},
) {
	requireWrites();
	const _rev = await getContentRev("productos", id);
	const updated = await emdashJson<ContentApiResponse>(
		`/_emdash/api/content/productos/${encodeURIComponent(id)}`,
		{
			method: "PUT",
			body: JSON.stringify({ data, _rev }),
		},
	);
	await publishContent("productos", id);
	return updated;
}

export async function deleteProductoViaApi(id: string) {
	requireWrites();
	return emdashJson(`/_emdash/api/content/productos/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function updateRestauranteViaApi(
	id: string,
	data: Record<string, unknown>,
) {
	requireWrites();
	const _rev = await getContentRev("restaurantes", id);
	const updated = await emdashJson<ContentApiResponse>(
		`/_emdash/api/content/restaurantes/${encodeURIComponent(id)}`,
		{
			method: "PUT",
			body: JSON.stringify({ data, _rev }),
		},
	);
	await publishContent("restaurantes", id);
	return updated;
}

export async function setProductoCategoriasViaApi(productoId: string, termIds: string[]) {
	requireWrites();
	return emdashJson(
		`/_emdash/api/content/productos/${encodeURIComponent(productoId)}/terms/categoria`,
		{
			method: "POST",
			body: JSON.stringify({ termIds }),
		},
	);
}

export async function createCategoriaViaApi(input: { label: string; slug?: string }) {
	requireWrites();
	const slug =
		input.slug?.trim() ||
		input.label
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	return emdashJson<TermApiResponse>("/_emdash/api/taxonomies/categoria/terms", {
		method: "POST",
		body: JSON.stringify({ slug, label: input.label }),
	});
}

export async function updateCategoriaViaApi(
	slug: string,
	input: { label?: string; slug?: string },
) {
	requireWrites();
	return emdashJson<TermApiResponse>(
		`/_emdash/api/taxonomies/categoria/terms/${encodeURIComponent(slug)}`,
		{
			method: "PUT",
			body: JSON.stringify(input),
		},
	);
}

export async function deleteCategoriaViaApi(slug: string) {
	requireWrites();
	return emdashJson(
		`/_emdash/api/taxonomies/categoria/terms/${encodeURIComponent(slug)}`,
		{ method: "DELETE" },
	);
}

export function assertProductoBelongsToRestaurant(
	producto: EmDashProducto,
	restaurantId: string,
): boolean {
	return producto.data.restaurante === restaurantId;
}
