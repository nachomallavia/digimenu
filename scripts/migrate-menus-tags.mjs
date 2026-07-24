#!/usr/bin/env node
/**
 * Ensure `menus` + `tags` collections and `productos.menus` / `productos.tags`.
 * Per restaurant: create default "Carta" menu if missing; assign all products to it
 * when `menus` is empty; set `tags` to [] when missing.
 *
 * Usage:
 *   node scripts/migrate-menus-tags.mjs --target local
 *   node scripts/migrate-menus-tags.mjs --target worker --token "$WORKER_PAT"
 *   node scripts/migrate-menus-tags.mjs --target local --dry-run
 *
 * Env: EMDASH_API_TOKEN, LOCAL_URL, WORKER_URL
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

async function loadDotEnv() {
	try {
		const text = await readFile(join(ROOT, ".env"), "utf8");
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const i = trimmed.indexOf("=");
			if (i < 1) continue;
			const key = trimmed.slice(0, i);
			const val = trimmed.slice(i + 1);
			if (!process.env[key]) process.env[key] = val;
		}
	} catch {
		/* optional */
	}
}

await loadDotEnv();

const LOCAL_URL = (
	process.env.LOCAL_URL ?? process.env.EMDASH_API_BASE ?? "http://localhost:4321"
).replace(/\/$/, "");
const WORKER_URL = (
	process.env.WORKER_URL ?? "https://digimenu.nachomallavia.workers.dev"
).replace(/\/$/, "");

function parseArgs(argv) {
	const out = {
		target: "local",
		token: process.env.EMDASH_API_TOKEN ?? "",
		dryRun: false,
	};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--target") out.target = argv[++i];
		else if (a === "--token") out.token = argv[++i];
		else if (a === "--dry-run") out.dryRun = true;
	}
	return out;
}

function unwrap(payload) {
	if (payload && typeof payload === "object" && "data" in payload) return payload.data;
	return payload;
}

async function apiJson(base, path, { method = "GET", token, body, allow404 = false } = {}) {
	const headers = { Accept: "application/json" };
	if (token) headers.Authorization = `Bearer ${token}`;
	let payload;
	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
		payload = JSON.stringify(body);
	}
	const res = await fetch(`${base}${path}`, { method, headers, body: payload });
	const text = await res.text();
	if (res.status === 404 && allow404) return null;
	let data;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = { raw: text };
	}
	if (!res.ok) {
		throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
	}
	return unwrap(data);
}

async function listAllContent(base, collection, token) {
	const items = [];
	let cursor;
	do {
		const q = new URLSearchParams({ limit: "100" });
		if (cursor) q.set("cursor", cursor);
		const data = await apiJson(base, `/_emdash/api/content/${collection}?${q}`, { token });
		items.push(...(data.items ?? []));
		cursor = data.nextCursor ?? null;
	} while (cursor);
	return items;
}

async function ensurePublished(base, collection, id, token) {
	try {
		await apiJson(base, `/_emdash/api/content/${collection}/${encodeURIComponent(id)}/publish`, {
			method: "POST",
			token,
			body: {},
		});
	} catch {
		/* already published */
	}
}

async function updateContent(base, collection, id, data, token) {
	const got = await apiJson(base, `/_emdash/api/content/${collection}/${encodeURIComponent(id)}`, {
		token,
	});
	const rev = got?._rev ?? got?.item?._rev;
	await apiJson(base, `/_emdash/api/content/${collection}/${encodeURIComponent(id)}`, {
		method: "PUT",
		token,
		body: { data, ...(rev ? { _rev: rev } : {}) },
	});
	await ensurePublished(base, collection, id, token);
}

function parseIdList(raw) {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw.filter((v) => typeof v === "string" && v.length > 0);
	if (typeof raw === "string") {
		try {
			return parseIdList(JSON.parse(raw));
		} catch {
			return [];
		}
	}
	return [];
}

async function listFields(base, collection, token) {
	const data = await apiJson(base, `/_emdash/api/schema/collections/${collection}/fields`, {
		token,
		allow404: true,
	});
	if (!data) return null;
	const items = Array.isArray(data) ? data : (data.items ?? data.fields ?? []);
	return new Set(items.map((f) => f.slug));
}

async function addField(base, collection, field, token, dryRun) {
	console.log(`  + ${collection}.${field.slug}`);
	if (dryRun) return;
	try {
		await apiJson(base, `/_emdash/api/schema/collections/${collection}/fields`, {
			method: "POST",
			token,
			body: field,
		});
	} catch (e) {
		if (!String(e.message).includes("FIELD_EXISTS") && !String(e.message).includes("already")) {
			throw e;
		}
		console.log(`    (ya existe)`);
	}
}

async function ensureCollection(base, token, dryRun, { slug, label, labelSingular, supports, fields }) {
	const existing = await apiJson(base, `/_emdash/api/schema/collections/${slug}`, {
		token,
		allow404: true,
	});
	if (!existing) {
		console.log(`  + collection ${slug}`);
		if (!dryRun) {
			await apiJson(base, "/_emdash/api/schema/collections", {
				method: "POST",
				token,
				body: { slug, label, labelSingular, supports },
			});
		}
	}
	const have = (await listFields(base, slug, token)) ?? new Set();
	for (const field of fields) {
		if (have.has(field.slug)) continue;
		await addField(base, slug, field, token, dryRun);
	}
}

const MENUS_FIELDS = [
	{ slug: "nombre", label: "Nombre", type: "string", required: true, searchable: true },
	{ slug: "descripcion", label: "Descripción", type: "text" },
	{
		slug: "restaurante",
		label: "Restaurante",
		type: "reference",
		required: true,
		options: { collection: "restaurantes" },
	},
	{ slug: "orden", label: "Orden", type: "number" },
	{ slug: "plantilla", label: "Plantilla", type: "string" },
];

const TAGS_FIELDS = [
	{ slug: "nombre", label: "Nombre", type: "string", required: true, searchable: true },
	{
		slug: "restaurante",
		label: "Restaurante",
		type: "reference",
		required: true,
		options: { collection: "restaurantes" },
	},
	{ slug: "icon", label: "Icono", type: "string" },
];

async function ensureSchema(base, token, dryRun) {
	await ensureCollection(base, token, dryRun, {
		slug: "menus",
		label: "Menús",
		labelSingular: "Menú",
		supports: ["drafts", "revisions"],
		fields: MENUS_FIELDS,
	});
	await ensureCollection(base, token, dryRun, {
		slug: "tags",
		label: "Etiquetas",
		labelSingular: "Etiqueta",
		supports: ["drafts", "revisions"],
		fields: TAGS_FIELDS,
	});

	const prodFields = (await listFields(base, "productos", token)) ?? new Set();
	if (!prodFields.has("menus")) {
		await addField(base, "productos", { slug: "menus", label: "Menús", type: "json" }, token, dryRun);
	}
	if (!prodFields.has("tags")) {
		await addField(base, "productos", { slug: "tags", label: "Etiquetas", type: "json" }, token, dryRun);
	}
}

async function migrateData(base, token, dryRun) {
	const restaurantes = await listAllContent(base, "restaurantes", token);
	if (restaurantes.length === 0) {
		console.log("  (no restaurantes)");
		return;
	}

	let allMenus = [];
	try {
		allMenus = await listAllContent(base, "menus", token);
	} catch (e) {
		console.log(`  (menus list: ${e.message.slice(0, 120)})`);
	}

	const productos = await listAllContent(base, "productos", token);

	for (const rest of restaurantes) {
		const restId = rest.id;
		const restSlug = rest.slug ?? restId;
		let menus = allMenus.filter((m) => m.data?.restaurante === restId);

		if (menus.length === 0) {
			const slug = restSlug === "finca" ? "carta" : `carta-${restSlug}`;
			console.log(`  + menu ${slug} for ${restSlug}`);
			if (!dryRun) {
				const created = await apiJson(base, "/_emdash/api/content/menus", {
					method: "POST",
					token,
					body: {
						slug,
						data: {
							nombre: "Carta",
							descripcion: "Menú principal",
							restaurante: restId,
							orden: 0,
							plantilla: "classic",
						},
					},
				});
				const menu = created.item ?? created;
				await ensurePublished(base, "menus", menu.id, token);
				menus = [menu];
				allMenus.push(menu);
			} else {
				menus = [{ id: "dry-run", data: { id: "dry-run" } }];
			}
		} else {
			console.log(`  = ${restSlug}: ${menus.length} menú(s)`);
		}

		const defaultMenuId = menus[0]?.id ?? menus[0]?.data?.id;
		if (!defaultMenuId) continue;

		let assigned = 0;
		let skipped = 0;
		for (const p of productos) {
			if (p.data?.restaurante !== restId) continue;
			const currentMenus = parseIdList(p.data?.menus);
			const hasTags = Array.isArray(p.data?.tags) || p.data?.tags === null;
			const needsMenus = currentMenus.length === 0;
			const needsTags = !hasTags && p.data?.tags === undefined;

			if (!needsMenus && p.data?.tags !== undefined) {
				skipped++;
				continue;
			}

			const patch = {};
			if (needsMenus) patch.menus = [defaultMenuId];
			if (p.data?.tags === undefined) patch.tags = [];

			if (Object.keys(patch).length === 0) {
				skipped++;
				continue;
			}

			console.log(`  → producto ${p.slug ?? p.id}: ${JSON.stringify(patch)}`);
			if (!dryRun) {
				await updateContent(base, "productos", p.id, patch, token);
			}
			assigned++;
		}
		console.log(`  ${restSlug} productos: actualizados=${assigned} ok=${skipped}`);
	}
}

const args = parseArgs(process.argv);
if (!args.token) {
	console.error("Requires --token or EMDASH_API_TOKEN (PAT for EmDash writes)");
	process.exit(1);
}

const targets = [];
if (args.target === "local" || args.target === "both") {
	targets.push({ name: "local", base: LOCAL_URL });
}
if (args.target === "worker" || args.target === "both") {
	targets.push({ name: "worker", base: WORKER_URL });
}

for (const t of targets) {
	console.log(`\n=== ${t.name} (${t.base})${args.dryRun ? " [dry-run]" : ""} ===`);
	await ensureSchema(t.base, args.token, args.dryRun);
	await migrateData(t.base, args.token, args.dryRun);
}
console.log("\nDone.");
