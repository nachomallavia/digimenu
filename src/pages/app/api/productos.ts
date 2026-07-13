import type { APIRoute } from "astro";
import { requireOwner, revalidateOwnerSession } from "../../../lib/auth/require-owner";
import { createProductoViaApi, listProductosForRestaurant } from "../../../lib/emdash/client";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return new Response(JSON.stringify({ error: "unauthorized", redirect: auth.redirect }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const { entries } = await listProductosForRestaurant(
			auth.owner.restaurant.emdash_restaurant_id,
		);
		return new Response(
			JSON.stringify({
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
					status: e.status,
				})),
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "list failed";
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return new Response(JSON.stringify({ error: "unauthorized", redirect: auth.redirect }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	let body: { nombre?: string; precio?: number; descripcion?: string; slug?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "invalid json" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!body.nombre || typeof body.precio !== "number") {
		return new Response(JSON.stringify({ error: "nombre and precio required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const created = await createProductoViaApi({
			nombre: body.nombre,
			precio: body.precio,
			descripcion: body.descripcion,
			slug: body.slug,
			restauranteId: auth.owner.restaurant.emdash_restaurant_id,
		});
		await revalidateOwnerSession(request, cookies);
		return new Response(JSON.stringify(created), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "create failed";
		const status = message.includes("EMDASH_API") ? 501 : 500;
		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}
};
