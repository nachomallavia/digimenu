import type { APIRoute } from "astro";
import { requireOwner, revalidateOwnerSession } from "../../../lib/auth/require-owner";
import {
	createCategoriaViaApi,
	deleteCategoriaViaApi,
	listCategorias,
	updateCategoriaViaApi,
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
		const items = await listCategorias();
		return new Response(JSON.stringify({ items }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
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

	let body: { label?: string; slug?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "invalid json" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!body.label) {
		return new Response(JSON.stringify({ error: "label required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const created = await createCategoriaViaApi({ label: body.label, slug: body.slug });
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

export const PUT: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return new Response(JSON.stringify({ error: "unauthorized", redirect: auth.redirect }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	let body: { slug?: string; label?: string; newSlug?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "invalid json" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!body.slug) {
		return new Response(JSON.stringify({ error: "slug required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const updated = await updateCategoriaViaApi(body.slug, {
			label: body.label,
			slug: body.newSlug,
		});
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

export const DELETE: APIRoute = async ({ request, cookies }) => {
	const auth = await requireOwner(request, cookies);
	if (!auth.ok) {
		return new Response(JSON.stringify({ error: "unauthorized", redirect: auth.redirect }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const url = new URL(request.url);
	const slug = url.searchParams.get("slug");
	if (!slug) {
		return new Response(JSON.stringify({ error: "slug required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		await deleteCategoriaViaApi(slug);
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
