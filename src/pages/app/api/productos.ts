import type { APIRoute } from "astro";
import { requireOwner } from "../../../lib/auth/require-owner";
import {
	createProductoViaApi,
	listCategoriasForRestaurant,
	listProductosForRestaurant,
} from "../../../lib/emdash/client";

export const prerender = false;

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export const GET: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return json(401, { error: "unauthorized", redirect: auth.redirect });
	}

	try {
		const { entries } = await listProductosForRestaurant(
			auth.owner.restaurant.emdash_restaurant_id,
		);
		return json(200, {
			restaurant: {
				id: auth.owner.restaurant.emdash_restaurant_id,
				slug: auth.owner.restaurant.emdash_restaurant_slug,
			},
			items: entries.map((e) => ({
				slug: e.id,
				id: e.data.id,
				nombre: e.data.nombre,
				descripcion: e.data.descripcion ?? null,
				precio: e.data.precio,
				imagen: e.data.imagen ?? null,
				categoriaId: e.data.categoria ?? null,
				status: e.status,
			})),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "list failed";
		return json(500, { error: message });
	}
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return json(401, { error: "unauthorized", redirect: auth.redirect });
	}

	let body: {
		nombre?: string;
		precio?: number;
		descripcion?: string;
		slug?: string;
		categoriaId?: string | null;
	};
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "invalid json" });
	}

	if (!body.nombre?.trim() || typeof body.precio !== "number" || body.precio < 0) {
		return json(400, { error: "nombre and precio required" });
	}

	try {
		const restaurantId = auth.owner.restaurant.emdash_restaurant_id;

		let categoriaId: string | null | undefined;
		if (body.categoriaId != null && body.categoriaId !== "") {
			const { entries } = await listCategoriasForRestaurant(restaurantId);
			const owned = entries.some((c) => c.data.id === body.categoriaId);
			if (!owned) {
				return json(400, { error: "categoria inválida" });
			}
			categoriaId = body.categoriaId;
		}

		const created = await createProductoViaApi({
			nombre: body.nombre.trim(),
			precio: body.precio,
			descripcion: body.descripcion,
			slug: body.slug,
			restauranteId: restaurantId,
			categoriaId,
		});
		return json(201, created);
	} catch (err) {
		const message = err instanceof Error ? err.message : "create failed";
		const status = message.includes("EMDASH_API") ? 501 : 500;
		return json(status, { error: message });
	}
};
