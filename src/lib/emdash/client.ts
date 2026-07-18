import { getEmDashCollection, getEmDashEntry } from "emdash";
import { emdashJson, getEmDashApiConfig, writesEnabled } from "./api";
import {
	bustOwnerListCache,
	getCachedList,
	setCachedList,
} from "./owner-list-cache";
import { parseMenuLayout, type MenuLayout } from "../menu-layout";
import { parseRestaurantTheme, type RestaurantTheme } from "../restaurant-theme";

export { writesEnabled };

export type EmDashImage = {
	id?: string;
	src?: string;
	url?: string;
	alt?: string;
	width?: number;
	height?: number;
	storageKey?: string;
	meta?: { storageKey?: string };
} | null | undefined;

/**
 * Best displayable URL for an EmDash image value.
 * Native image fields are stored as media references without `src`;
 * fall back to the storage key route in that case.
 */
export function imageSrc(image: EmDashImage): string | undefined {
	if (!image) return undefined;
	if (image.src || image.url) return image.src ?? image.url;
	const key = image.meta?.storageKey ?? image.storageKey;
	return key ? `/_emdash/api/media/file/${key}` : undefined;
}

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
		categoria?: string;
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

export type EmDashCategoria = {
	id: string;
	slug: string | null;
	status: string;
	data: {
		id: string;
		nombre: string;
		restaurante?: string;
		icon?: string | null;
		cover?: EmDashImage;
		orden?: number | null;
	};
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

function requireWrites() {
	if (!getEmDashApiConfig()) {
		throw new Error("EMDASH_API_BASE and EMDASH_API_TOKEN required for writes");
	}
}

/** Non-empty File from multipart form field, or null. */
export function formImageFile(form: FormData, name: string): File | null {
	const value = form.get(name);
	if (value instanceof File && value.size > 0) return value;
	return null;
}

type MediaUploadItem = {
	id: string;
	filename?: string;
	mimeType?: string;
	mime_type?: string;
	storageKey?: string;
	storage_key?: string;
	url?: string;
	src?: string;
	width?: number;
	height?: number;
};

type MediaUploadResponse = {
	item?: MediaUploadItem;
	id?: string;
};

export function mediaItemToImageValue(
	item: MediaUploadItem,
	alt: string,
): { id: string; src?: string; url?: string; alt: string; width?: number; height?: number } {
	const storageKey = item.storageKey ?? item.storage_key;
	const src =
		item.url ??
		item.src ??
		(storageKey ? `/_emdash/api/media/file/${storageKey}` : undefined);
	return {
		id: item.id,
		src,
		url: item.url ?? src,
		alt,
		width: item.width,
		height: item.height,
	};
}

export async function uploadMediaViaApi(file: File, alt?: string) {
	requireWrites();
	const body = new FormData();
	body.append("file", file, file.name || "upload");
	if (alt) body.append("alt", alt);

	const data = await emdashJson<MediaUploadResponse>("/_emdash/api/media", {
		method: "POST",
		body,
	});

	const item = data.item ?? (data.id ? (data as MediaUploadItem) : null);
	if (!item?.id) {
		throw new Error("EmDash media upload did not return an item id");
	}
	return mediaItemToImageValue(item, alt ?? file.name ?? "Imagen");
}

/**
 * List productos for a restaurant via in-process EmDash (same Astro app).
 * No PAT required for reads. Worker-side read-through cache (see owner-list-cache).
 */
export async function listProductosForRestaurant(restaurantId: string) {
	const cached = await getCachedList("productos", restaurantId);
	if (cached) {
		return { entries: cached as EmDashProducto[], cacheHint: undefined };
	}

	const { entries, cacheHint, error } = await getEmDashCollection("productos", {
		where: { restaurante: restaurantId },
		limit: 200,
	});

	if (error) {
		throw new Error(error.message ?? "Failed to list productos");
	}
	// Preserve categoria as reference ULID (not display name) for edits / API.
	const typed = entries as unknown as EmDashProducto[];
	await setCachedList(
		"productos",
		restaurantId,
		typed.map((e) => ({
			id: e.id,
			slug: e.slug,
			status: e.status,
			data: {
				id: e.data.id,
				nombre: e.data.nombre,
				descripcion: e.data.descripcion,
				precio: e.data.precio,
				imagen: e.data.imagen ?? null,
				restaurante: e.data.restaurante,
				categoria: e.data.categoria ?? null,
			},
		})),
	);
	return { entries: typed, cacheHint };
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

// ---------- Categorías (collection, per-restaurant) ----------

function sortCategorias(entries: EmDashCategoria[]): EmDashCategoria[] {
	return [...entries].sort((a, b) => {
		const oa = a.data.orden ?? Number.MAX_SAFE_INTEGER;
		const ob = b.data.orden ?? Number.MAX_SAFE_INTEGER;
		if (oa !== ob) return oa - ob;
		return (a.data.nombre ?? "").localeCompare(b.data.nombre ?? "");
	});
}

/**
 * List categorías of one restaurant, ordered by `orden`.
 * In-process read — no PAT required. Worker-side read-through cache.
 */
export async function listCategoriasForRestaurant(restaurantId: string) {
	const cached = await getCachedList("categorias", restaurantId);
	if (cached) {
		return {
			entries: sortCategorias(cached as EmDashCategoria[]),
			cacheHint: undefined,
		};
	}

	const { entries, cacheHint, error } = await getEmDashCollection("categorias", {
		where: { restaurante: restaurantId },
		limit: 100,
	});
	if (error) throw new Error(error.message ?? "Failed to list categorias");
	const typed = sortCategorias(entries as EmDashCategoria[]);
	await setCachedList(
		"categorias",
		restaurantId,
		typed.map((e) => ({
			id: e.id,
			slug: e.slug,
			status: e.status,
			data: {
				id: e.data.id,
				nombre: e.data.nombre,
				restaurante: e.data.restaurante,
				icon: e.data.icon ?? null,
				cover: e.data.cover ?? null,
				orden: e.data.orden ?? null,
			},
		})),
	);
	return { entries: typed, cacheHint };
}

export async function getCategoriaBySlug(idOrSlug: string) {
	const { entry, cacheHint, error } = await getEmDashEntry("categorias", idOrSlug);
	if (error) throw new Error(error.message ?? "Failed to get categoria");
	return { entry: entry as EmDashCategoria | null, cacheHint };
}

export function assertCategoriaBelongsToRestaurant(
	categoria: EmDashCategoria,
	restaurantId: string,
): boolean {
	return categoria.data.restaurante === restaurantId;
}

export async function createCategoriaViaApi(input: {
	nombre: string;
	restauranteId: string;
	icon?: string | null;
	cover?: EmDashImage | null;
	orden?: number;
	slug?: string;
}) {
	requireWrites();
	const slug =
		input.slug?.trim() ||
		input.nombre
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	const created = await emdashJson<ContentApiResponse>("/_emdash/api/content/categorias", {
		method: "POST",
		body: JSON.stringify({
			slug: slug || undefined,
			data: {
				nombre: input.nombre,
				restaurante: input.restauranteId,
				icon: input.icon ?? null,
				cover: input.cover ?? null,
				orden: input.orden ?? 0,
			},
		}),
	});
	if (created.item?.id) {
		await publishContent("categorias", created.item.id);
	}
	await bustOwnerListCache(input.restauranteId, "both");
	return created;
}

export async function updateCategoriaViaApi(
	id: string,
	data: {
		nombre?: string;
		icon?: string | null;
		cover?: EmDashImage | null;
		orden?: number;
	},
	restaurantId: string,
) {
	requireWrites();
	const updated = await emdashJson<ContentApiResponse>(
		`/_emdash/api/content/categorias/${encodeURIComponent(id)}`,
		{
			method: "PUT",
			body: JSON.stringify({ data }),
		},
	);
	await publishContent("categorias", id);
	await bustOwnerListCache(restaurantId, "both");
	return updated;
}

export async function deleteCategoriaViaApi(id: string, restaurantId: string) {
	requireWrites();
	const result = await emdashJson(
		`/_emdash/api/content/categorias/${encodeURIComponent(id)}`,
		{ method: "DELETE" },
	);
	await bustOwnerListCache(restaurantId, "both");
	return result;
}

// ---------- Productos (writes) ----------

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
	categoriaId?: string | null;
	slug?: string;
}) {
	requireWrites();
	const created = await emdashJson<ContentApiResponse>("/_emdash/api/content/productos", {
		method: "POST",
		body: JSON.stringify({
			slug: input.slug,
			data: {
				nombre: input.nombre,
				precio: input.precio,
				descripcion: input.descripcion,
				restaurante: input.restauranteId,
				...(input.categoriaId !== undefined ? { categoria: input.categoriaId } : {}),
			},
		}),
	});
	if (created.item?.id) {
		await publishContent("productos", created.item.id);
	}
	await bustOwnerListCache(input.restauranteId, "both");
	return created;
}

export type ProductoUpdateData = {
	nombre?: string;
	precio?: number;
	descripcion?: string | null;
	imagen?: EmDashImage | null;
	categoria?: string | null;
};

async function putProductoViaApi(id: string, data: ProductoUpdateData) {
	requireWrites();
	const updated = await emdashJson<ContentApiResponse>(
		`/_emdash/api/content/productos/${encodeURIComponent(id)}`,
		{
			method: "PUT",
			body: JSON.stringify({ data }),
		},
	);
	await publishContent("productos", id);
	return updated;
}

export async function updateProductoViaApi(
	id: string,
	data: ProductoUpdateData,
	restaurantId: string,
) {
	const updated = await putProductoViaApi(id, data);
	await bustOwnerListCache(restaurantId, "both");
	return updated;
}

/**
 * Batch product updates with a single owner-list cache bust.
 * Continues on per-item errors; caller should surface `failed`.
 */
export async function updateProductosBatchViaApi(
	changes: Record<string, ProductoUpdateData>,
	restaurantId: string,
): Promise<{
	updated: number;
	failed: { id: string; error: string }[];
}> {
	requireWrites();
	const failed: { id: string; error: string }[] = [];
	let updated = 0;
	for (const [id, data] of Object.entries(changes)) {
		try {
			await putProductoViaApi(id, data);
			updated += 1;
		} catch (err) {
			failed.push({
				id,
				error: err instanceof Error ? err.message : "No se pudo actualizar",
			});
		}
	}
	if (updated > 0) {
		await bustOwnerListCache(restaurantId, "both");
	}
	return { updated, failed };
}

export async function deleteProductoViaApi(id: string, restaurantId: string) {
	requireWrites();
	const result = await emdashJson(
		`/_emdash/api/content/productos/${encodeURIComponent(id)}`,
		{ method: "DELETE" },
	);
	await bustOwnerListCache(restaurantId, "both");
	return result;
}

export async function updateRestauranteViaApi(
	id: string,
	data: Record<string, unknown>,
) {
	requireWrites();
	const updated = await emdashJson<ContentApiResponse>(
		`/_emdash/api/content/restaurantes/${encodeURIComponent(id)}`,
		{
			method: "PUT",
			body: JSON.stringify({ data }),
		},
	);
	await publishContent("restaurantes", id);
	return updated;
}

export function assertProductoBelongsToRestaurant(
	producto: EmDashProducto,
	restaurantId: string,
): boolean {
	return producto.data.restaurante === restaurantId;
}
