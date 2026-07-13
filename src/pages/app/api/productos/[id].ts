import type { APIRoute } from "astro";
import { requireOwner, revalidateOwnerSession } from "../../../../lib/auth/require-owner";
import {
	assertProductoBelongsToRestaurant,
	deleteProductoViaApi,
	getProductoBySlug,
	getProductoCategorias,
	setProductoCategoriasViaApi,
	updateProductoViaApi,
} from "../../../../lib/emdash/client";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, params }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return new Response(JSON.stringify({ error: "unauthorized", redirect: auth.redirect }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const id = params.id;
	if (!id) {
		return new Response(JSON.stringify({ error: "id required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const { entry } = await getProductoBySlug(id);
		if (
			!entry ||
			!assertProductoBelongsToRestaurant(entry, auth.owner.restaurant.emdash_restaurant_id)
		) {
			return new Response(JSON.stringify({ error: "not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}
		const categorias = await getProductoCategorias(entry.data.id);
		return new Response(
			JSON.stringify({
				slug: entry.id,
				id: entry.data.id,
				nombre: entry.data.nombre,
				descripcion: entry.data.descripcion ?? null,
				precio: entry.data.precio,
				imagen: entry.data.imagen ?? null,
				status: entry.status,
				categorias,
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

export const PUT: APIRoute = async ({ request, cookies, params }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return new Response(JSON.stringify({ error: "unauthorized", redirect: auth.redirect }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const id = params.id;
	if (!id) {
		return new Response(JSON.stringify({ error: "id required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	let body: {
		nombre?: string;
		precio?: number;
		descripcion?: string | null;
		categoriaIds?: string[];
	};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "invalid json" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const { entry } = await getProductoBySlug(id);
		if (
			!entry ||
			!assertProductoBelongsToRestaurant(entry, auth.owner.restaurant.emdash_restaurant_id)
		) {
			return new Response(JSON.stringify({ error: "not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		const updated = await updateProductoViaApi(entry.data.id, {
			nombre: body.nombre,
			precio: body.precio,
			descripcion: body.descripcion,
		});

		if (Array.isArray(body.categoriaIds)) {
			await setProductoCategoriasViaApi(entry.data.id, body.categoriaIds);
		}

		await revalidateOwnerSession(request, cookies);
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

export const DELETE: APIRoute = async ({ request, cookies, params }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return new Response(JSON.stringify({ error: "unauthorized", redirect: auth.redirect }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const id = params.id;
	if (!id) {
		return new Response(JSON.stringify({ error: "id required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const { entry } = await getProductoBySlug(id);
		if (
			!entry ||
			!assertProductoBelongsToRestaurant(entry, auth.owner.restaurant.emdash_restaurant_id)
		) {
			return new Response(JSON.stringify({ error: "not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}
		await deleteProductoViaApi(entry.data.id);
		await revalidateOwnerSession(request, cookies);
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "delete failed";
		const status = message.includes("EMDASH_API") ? 501 : 500;
		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}
};
