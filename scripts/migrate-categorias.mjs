#!/usr/bin/env node
/**
 * Migrate taxonomy `categoria` + `restaurantes.category_meta` to the
 * `categorias` collection (reference-based, per-restaurant).
 *
 * Idempotent: safe to re-run. Steps:
 *   1. Ensure schema: collection `categorias` (+ fields) and `productos.categoria`.
 *   2. One `categorias` entry per taxonomy term (icon/cover from category_meta,
 *      `orden` = term position so the public menu keeps its section order).
 *   3. Set `productos.categoria` from each product's first term (warns on >1).
 *   4. --cleanup: delete taxonomy terms + drop `restaurantes.category_meta`.
 *      (The taxonomy *definition* cannot be removed via API — do it in admin.)
 *
 * Usage:
 *   node scripts/migrate-categorias.mjs --target local
 *   node scripts/migrate-categorias.mjs --target worker --token "$WORKER_PAT"
 *   node scripts/migrate-categorias.mjs --target local --cleanup
 *
 * Env: EMDASH_API_TOKEN (PAT), LOCAL_URL, WORKER_URL
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
		cleanup: false,
	};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--target") out.target = argv[++i];
		else if (a === "--token") out.token = argv[++i];
		else if (a === "--dry-run") out.dryRun = true;
		else if (a === "--cleanup") out.cleanup = true;
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

// ---------- Schema ----------

const CATEGORIAS_FIELDS = [
	{ slug: "nombre", label: "Nombre", type: "string", required: true, searchable: true },
	{
		slug: "restaurante",
		label: "Restaurante",
		type: "reference",
		required: true,
		options: { collection: "restaurantes" },
	},
	{ slug: "icon", label: "Icono", type: "string" },
	{ slug: "cover", label: "Portada", type: "image" },
	{ slug: "orden", label: "Orden", type: "number" },
];

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
		if (!e.message.includes("FIELD_EXISTS")) throw e;
		console.log(`    (ya existe)`);
	}
}

async function ensureSchema(base, token, dryRun) {
	const existing = await apiJson(base, "/_emdash/api/schema/collections/categorias", {
		token,
		allow404: true,
	});

	if (!existing) {
		console.log("  + collection categorias");
		if (!dryRun) {
			await apiJson(base, "/_emdash/api/schema/collections", {
				method: "POST",
				token,
				body: {
					slug: "categorias",
					label: "Categorías",
					labelSingular: "Categoría",
					supports: ["drafts", "revisions"],
				},
			});
		}
	}

	const have = (await listFields(base, "categorias", token)) ?? new Set();
	for (const field of CATEGORIAS_FIELDS) {
		if (have.has(field.slug)) continue;
		await addField(base, "categorias", field, token, dryRun);
	}

	const prodFields = (await listFields(base, "productos", token)) ?? new Set();
	if (!prodFields.has("categoria")) {
		await addField(
			base,
			"productos",
			{
				slug: "categoria",
				label: "Categoría",
				type: "reference",
				options: { collection: "categorias" },
			},
			token,
			dryRun,
		);
	}
}

// ---------- Data ----------

async function listTerms(base, token) {
	try {
		const data = await apiJson(base, "/_emdash/api/taxonomies/categoria/terms?limit=100", {
			token,
		});
		if (Array.isArray(data)) return data;
		return data.items ?? data.terms ?? [];
	} catch (e) {
		console.log(`  (no taxonomy terms: ${e.message.slice(0, 120)})`);
		return [];
	}
}

async function migrateData(base, token, dryRun) {
	const restaurantes = await listAllContent(base, "restaurantes", token);
	if (restaurantes.length === 0) throw new Error("No restaurantes found");
	if (restaurantes.length > 1) {
		console.warn(
			`  ! ${restaurantes.length} restaurantes — assigning all terms to the first (${restaurantes[0].slug})`,
		);
	}
	const finca = restaurantes[0];
	const categoryMeta =
		finca.data?.category_meta && typeof finca.data.category_meta === "object"
			? finca.data.category_meta
			: {};

	const terms = await listTerms(base, token);
	let existingCats = [];
	try {
		existingCats = await listAllContent(base, "categorias", token);
	} catch {
		// Collection missing (dry-run before schema creation)
	}
	const catBySlug = new Map(existingCats.map((c) => [c.slug, c]));

	// termId -> categoria ULID
	const termIdToCatId = new Map();
	// term slug -> categoria ULID (for products whose terms API returns slugs)
	const termSlugToCatId = new Map();

	let orden = 0;
	for (const term of terms) {
		const slug = term.slug;
		let cat = catBySlug.get(slug);
		if (!cat) {
			const meta = categoryMeta[term.id] ?? {};
			const data = {
				nombre: term.label ?? slug,
				restaurante: finca.id,
				orden,
			};
			if (typeof meta.icon === "string") data.icon = meta.icon;
			if (meta.cover && typeof meta.cover === "object" && meta.cover.id) data.cover = meta.cover;

			console.log(`  + categoria ${slug} (orden ${orden})`);
			if (!dryRun) {
				const created = await apiJson(base, "/_emdash/api/content/categorias", {
					method: "POST",
					token,
					body: { slug, data },
				});
				cat = created.item ?? created;
				await ensurePublished(base, "categorias", cat.id, token);
			}
		} else {
			console.log(`  = categoria ${slug} exists`);
		}
		if (cat) {
			termIdToCatId.set(term.id, cat.id);
			termSlugToCatId.set(slug, cat.id);
		}
		orden++;
	}

	// Products: first term wins
	const productos = await listAllContent(base, "productos", token);
	let ok = 0;
	let skipped = 0;
	let unmatched = 0;
	for (const p of productos) {
		if (p.data?.categoria) {
			skipped++;
			continue;
		}
		let entryTerms = [];
		try {
			const data = await apiJson(
				base,
				`/_emdash/api/content/productos/${encodeURIComponent(p.id)}/terms/categoria`,
				{ token },
			);
			entryTerms = Array.isArray(data) ? data : (data.terms ?? data.items ?? []);
		} catch {
			entryTerms = [];
		}
		if (entryTerms.length === 0) {
			unmatched++;
			console.warn(`  ! producto ${p.slug ?? p.id}: sin categoría`);
			continue;
		}
		if (entryTerms.length > 1) {
			console.warn(
				`  ! producto ${p.slug ?? p.id}: ${entryTerms.length} categorías, usando la primera (${entryTerms[0].slug})`,
			);
		}
		const t = entryTerms[0];
		const catId = termIdToCatId.get(t.id) ?? termSlugToCatId.get(t.slug);
		if (!catId) {
			unmatched++;
			console.warn(`  ! producto ${p.slug ?? p.id}: término ${t.slug} sin categoría destino`);
			continue;
		}
		console.log(`  → producto ${p.slug ?? p.id} → ${t.slug}`);
		if (!dryRun) {
			await updateContent(base, "productos", p.id, { categoria: catId }, token);
		}
		ok++;
	}
	console.log(`  productos: asignados=${ok} ya-migrados=${skipped} sin-match=${unmatched}`);
	return { terms, finca };
}

// ---------- Cleanup ----------

async function cleanup(base, token, terms, dryRun) {
	for (const term of terms) {
		console.log(`  - term ${term.slug}`);
		if (!dryRun) {
			try {
				await apiJson(
					base,
					`/_emdash/api/taxonomies/categoria/terms/${encodeURIComponent(term.slug)}`,
					{ method: "DELETE", token },
				);
			} catch (e) {
				console.warn(`    (${e.message.slice(0, 120)})`);
			}
		}
	}

	const restaurantes = await apiJson(base, "/_emdash/api/schema/collections/restaurantes", {
		token,
	});
	const hasMeta = (restaurantes?.fields ?? []).some((f) => f.slug === "category_meta");
	if (hasMeta) {
		console.log("  - restaurantes.category_meta");
		if (!dryRun) {
			await apiJson(base, "/_emdash/api/schema/collections/restaurantes/fields/category_meta", {
				method: "DELETE",
				token,
			});
		}
	}
	console.log(
		"  NOTE: la definición de la taxonomía `categoria` debe borrarse desde /_emdash/admin (la API no lo permite).",
	);
}

// ---------- Main ----------

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
	const { terms } = await migrateData(t.base, args.token, args.dryRun);
	if (args.cleanup) {
		await cleanup(t.base, args.token, terms, args.dryRun);
	}
}
console.log("\nDone.");
