import type { APIRoute } from "astro";
import { refreshOwnerSnapshot, requireOwner } from "../../../lib/auth/require-owner";
import type { OwnerRestaurantSnapshot } from "../../../lib/auth/owner-session";
import {
	getRestauranteById,
	restauranteMenuLayout,
	restauranteTheme,
	updateRestauranteViaApi,
} from "../../../lib/emdash/client";

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
		const { entry } = await getRestauranteById(auth.owner.restaurant.emdash_restaurant_slug);
		if (!entry) {
			return new Response(JSON.stringify({ error: "not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response(
			JSON.stringify({
				id: entry.data.id,
				slug: entry.id,
				nombre: entry.data.nombre,
				descripcion: entry.data.descripcion ?? null,
				logo: entry.data.logo ?? null,
				menu_layout: restauranteMenuLayout(entry),
				theme: restauranteTheme(entry),
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "get failed";
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return new Response(JSON.stringify({ error: "unauthorized", redirect: auth.redirect }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "invalid json" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const data: Record<string, unknown> = {};
	if (typeof body.nombre === "string") data.nombre = body.nombre;
	if ("descripcion" in body) data.descripcion = body.descripcion;
	if ("menu_layout" in body) data.menu_layout = body.menu_layout;
	if ("theme" in body) data.theme = body.theme;

	if (Object.keys(data).length === 0) {
		return new Response(JSON.stringify({ error: "no fields" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const updated = await updateRestauranteViaApi(
			auth.owner.restaurant.emdash_restaurant_id,
			data,
		);
		const patch: Partial<OwnerRestaurantSnapshot> = {};
		if (typeof data.nombre === "string") patch.nombre = data.nombre;
		if ("descripcion" in data) {
			patch.descripcion = typeof data.descripcion === "string" ? data.descripcion : null;
		}
		if ("menu_layout" in data) patch.menu_layout = data.menu_layout;
		if ("theme" in data) patch.theme = data.theme;
		await refreshOwnerSnapshot(cookies, auth.owner, patch);
		return new Response(JSON.stringify(updated), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "update failed";
		const status = message.includes("EMDASH_API") ? 501 : 500;
		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}
};
