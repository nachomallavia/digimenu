import type { APIRoute } from "astro";
import { requireOwner } from "../../../../lib/auth/require-owner";
import {
	assertProductoBelongsToRestaurant,
	deleteProductoViaApi,
	getProductoBySlug,
	listCategoriasForRestaurant,
	updateProductoViaApi,
} from "../../../../lib/emdash/client";

export const prerender = false;

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function errorStatus(message: string): number {
	return message.includes("EMDASH_API") ? 501 : 500;
}

export const GET: APIRoute = async ({ request, cookies, params }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return json(401, { error: "unauthorized", redirect: auth.redirect });
	}

	const id = params.id;
	if (!id) {
		return json(400, { error: "id required" });
	}

	try {
		const { entry } = await getProductoBySlug(id);
		if (
			!entry ||
			!assertProductoBelongsToRestaurant(entry, auth.owner.restaurant.emdash_restaurant_id)
		) {
			return json(404, { error: "not found" });
		}
		return json(200, {
			slug: entry.id,
			id: entry.data.id,
			nombre: entry.data.nombre,
			descripcion: entry.data.descripcion ?? null,
			precio: entry.data.precio,
			imagen: entry.data.imagen ?? null,
			categoriaId: entry.data.categoria ?? null,
			status: entry.status,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "get failed";
		return json(500, { error: message });
	}
};

export const PUT: APIRoute = async ({ request, cookies, params }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return json(401, { error: "unauthorized", redirect: auth.redirect });
	}

	const id = params.id;
	if (!id) {
		return json(400, { error: "id required" });
	}

	let body: {
		nombre?: string;
		precio?: number;
		descripcion?: string | null;
		categoriaId?: string | null;
	};
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "invalid json" });
	}

	try {
		const restaurantId = auth.owner.restaurant.emdash_restaurant_id;
		const { entry } = await getProductoBySlug(id);
		if (!entry || !assertProductoBelongsToRestaurant(entry, restaurantId)) {
			return json(404, { error: "not found" });
		}

		let categoria: string | null | undefined;
		if (body.categoriaId !== undefined) {
			if (body.categoriaId === null || body.categoriaId === "") {
				categoria = null;
			} else {
				const { entries } = await listCategoriasForRestaurant(restaurantId);
				const owned = entries.some((c) => c.data.id === body.categoriaId);
				if (!owned) {
					return json(400, { error: "categoria inválida" });
				}
				categoria = body.categoriaId;
			}
		}

		const updated = await updateProductoViaApi(entry.data.id, {
			nombre: body.nombre,
			precio: body.precio,
			descripcion: body.descripcion,
			...(categoria !== undefined ? { categoria } : {}),
		});

		return json(200, updated);
	} catch (err) {
		const message = err instanceof Error ? err.message : "update failed";
		return json(errorStatus(message), { error: message });
	}
};

export const DELETE: APIRoute = async ({ request, cookies, params }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return json(401, { error: "unauthorized", redirect: auth.redirect });
	}

	const id = params.id;
	if (!id) {
		return json(400, { error: "id required" });
	}

	try {
		const { entry } = await getProductoBySlug(id);
		if (
			!entry ||
			!assertProductoBelongsToRestaurant(entry, auth.owner.restaurant.emdash_restaurant_id)
		) {
			return json(404, { error: "not found" });
		}
		await deleteProductoViaApi(entry.data.id);
		return json(200, { ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "delete failed";
		return json(errorStatus(message), { error: message });
	}
};
