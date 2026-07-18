import type { APIRoute } from "astro";
import { requireOwner } from "../../../lib/auth/require-owner";
import {
	assertCategoriaBelongsToRestaurant,
	createCategoriaViaApi,
	deleteCategoriaViaApi,
	getCategoriaBySlug,
	imageSrc,
	listCategoriasForRestaurant,
	updateCategoriaViaApi,
} from "../../../lib/emdash/client";

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

export const GET: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return json(401, { error: "unauthorized", redirect: auth.redirect });
	}

	try {
		const { entries } = await listCategoriasForRestaurant(
			auth.owner.restaurant.emdash_restaurant_id,
		);
		const items = entries.map((cat) => ({
			id: cat.data.id,
			slug: cat.id,
			label: cat.data.nombre,
			icon: cat.data.icon ?? null,
			coverSrc: imageSrc(cat.data.cover) ?? null,
			orden: cat.data.orden ?? 0,
		}));
		return json(200, { items });
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

	let body: { label?: string; icon?: string | null; orden?: number };
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "invalid json" });
	}

	if (!body.label?.trim()) {
		return json(400, { error: "label required" });
	}

	try {
		const created = await createCategoriaViaApi({
			nombre: body.label.trim(),
			restauranteId: auth.owner.restaurant.emdash_restaurant_id,
			icon: body.icon ?? null,
			orden: typeof body.orden === "number" ? body.orden : undefined,
		});
		return json(201, created);
	} catch (err) {
		const message = err instanceof Error ? err.message : "create failed";
		return json(errorStatus(message), { error: message });
	}
};

export const PUT: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return json(401, { error: "unauthorized", redirect: auth.redirect });
	}

	let body: { slug?: string; label?: string; icon?: string | null; orden?: number };
	try {
		body = await request.json();
	} catch {
		return json(400, { error: "invalid json" });
	}

	if (!body.slug) {
		return json(400, { error: "slug required" });
	}

	try {
		const { entry } = await getCategoriaBySlug(body.slug);
		if (
			!entry ||
			!assertCategoriaBelongsToRestaurant(entry, auth.owner.restaurant.emdash_restaurant_id)
		) {
			return json(404, { error: "not found" });
		}
		const updated = await updateCategoriaViaApi(entry.data.id, {
			nombre: body.label,
			icon: body.icon,
			orden: body.orden,
		});
		return json(200, updated);
	} catch (err) {
		const message = err instanceof Error ? err.message : "update failed";
		return json(errorStatus(message), { error: message });
	}
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return json(401, { error: "unauthorized", redirect: auth.redirect });
	}

	const url = new URL(request.url);
	const slug = url.searchParams.get("slug");
	if (!slug) {
		return json(400, { error: "slug required" });
	}

	try {
		const { entry } = await getCategoriaBySlug(slug);
		if (
			!entry ||
			!assertCategoriaBelongsToRestaurant(entry, auth.owner.restaurant.emdash_restaurant_id)
		) {
			return json(404, { error: "not found" });
		}
		await deleteCategoriaViaApi(entry.data.id);
		return json(200, { ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "delete failed";
		return json(errorStatus(message), { error: message });
	}
};
