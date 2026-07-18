#!/usr/bin/env node
/**
 * Download Unsplash 4:5 demos, upload to EmDash media, attach to productos + category_meta.
 *
 * Usage:
 *   node scripts/seed-demo-images.mjs --target local
 *   node scripts/seed-demo-images.mjs --target worker --token "$EMDASH_API_TOKEN"
 *   node scripts/seed-demo-images.mjs --target both --token "$EMDASH_API_TOKEN"
 *
 * Env:
 *   EMDASH_API_TOKEN  required for worker (Bearer PAT)
 *   LOCAL_URL         default http://localhost:4321
 *   WORKER_URL        default https://digimenu.nachomallavia.workers.dev
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE_DIR = join(ROOT, "tmp", "demo-images");
const POOLS = JSON.parse(await readFile(join(__dirname, "demo-image-pools.json"), "utf8"));

/** Load KEY=VAL from .env without printing secrets. */
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

const LOCAL_URL = (process.env.LOCAL_URL ?? process.env.EMDASH_API_BASE ?? "http://localhost:4321").replace(
	/\/$/,
	"",
);
const WORKER_URL = (
	process.env.WORKER_URL ?? "https://digimenu.nachomallavia.workers.dev"
).replace(/\/$/, "");

const CROP = "auto=format&fit=crop&w=800&h=1000&q=80";

const KEYWORD_RULES = [
	{ re: /espresso|long-black|doppio|cortado|macchiato|cafe-solo|filtrado|chemex/, pool: "coffee" },
	{ re: /latte|cappuccino|flat-white|lagrima|moccacino|cafe-con-leche|cafe-espresso-leche/, pool: "latte" },
	{ re: /filtrado|filtrados/, pool: "filter" },
	{ re: /sandwich|sandwiches/, pool: "sandwich" },
	{ re: /toston|tostones|tostado|avocado|palta/, pool: "toast" },
	{ re: /alfajor|brownie|tiramisu|mousse|flan|budin|affogato|crumble|helado|postres/, pool: "dessert" },
	{ re: /torta|minicake|cake/, pool: "cake" },
	{ re: /croissant|medialuna|roll|chipa|horneados|pastry/, pool: "pastry" },
	{ re: /yogur|yogurt|bowls/, pool: "yogurt" },
	{ re: /empanada/, pool: "empanada" },
	{ re: /milanesa|bastones|pollo/, pool: "milanesa" },
	{ re: /papa|bomba|tortilla|provoleta|pastel|trucha/, pool: "potato" },
	{ re: /burrata|pate|girgola|tapeos|salad|verdura/, pool: "tapa" },
	{ re: /cazuela|huevo/, pool: "toast" },
	{ re: /ipa|ale|cerveza|kraken|session|golden|irish|east-coast|american-ipa/, pool: "beer" },
	{ re: /gin|negroni|fernet|vermut|ron-|havana|tragos|cocktail/, pool: "cocktail" },
	{ re: /whisky|whiskys|jameson|black-label/, pool: "whisky" },
	{ re: /coca|sprite|schweppes|ginger|tonica|pomelo|soda/, pool: "soda" },
	{ re: /jugo|licuado|naranja|citric/, pool: "juice" },
	{ re: /agua/, pool: "water" },
	{ re: /\bte\b|^te$|chocolatada|sin-cafe|sin-alcohol/, pool: "tea" },
	{ re: /chocolate|chocolatada/, pool: "chocolate" },
];

const CATEGORY_POOL = {
	"bowls-de-yogur-griego": "yogurt",
	"cafe-espresso-leche": "latte",
	"cafe-solo": "coffee",
	"cervezas-kraken-473ml": "beer",
	filtrados: "filter",
	horneados: "pastry",
	postres: "dessert",
	"sin-alcohol": "soda",
	"sin-cafe": "tea",
	"sandwiches-especiales": "sandwich",
	tapeos: "tapa",
	"tortas-y-alfajores": "cake",
	"tostones-y-sandwiches": "toast",
	tragos: "cocktail",
	whiskys: "whisky",
};

function parseArgs(argv) {
	const out = { target: "local", token: process.env.EMDASH_API_TOKEN ?? "", dryRun: false, onlyMissing: false };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--target") out.target = argv[++i];
		else if (a === "--token") out.token = argv[++i];
		else if (a === "--dry-run") out.dryRun = true;
		else if (a === "--only-missing") out.onlyMissing = true;
	}
	return out;
}

function hashIndex(slug, n) {
	const h = createHash("sha1").update(slug).digest();
	return h.readUInt32BE(0) % n;
}

function poolForSlug(slug) {
	for (const rule of KEYWORD_RULES) {
		if (rule.re.test(slug)) return rule.pool;
	}
	return "default";
}

function photoIdFor(slug, poolName) {
	const pool = POOLS[poolName] ?? POOLS.default;
	return pool[hashIndex(slug, pool.length)];
}

function unsplashUrl(photoId) {
	return `https://images.unsplash.com/${photoId}?${CROP}`;
}

function unwrap(payload) {
	if (payload && typeof payload === "object" && "data" in payload) {
		return payload.data;
	}
	return payload;
}

async function apiJson(base, path, { method = "GET", token, body, formData } = {}) {
	const headers = { Accept: "application/json" };
	if (token) headers.Authorization = `Bearer ${token}`;
	let payload = body;
	if (formData) {
		payload = formData;
	} else if (body && typeof body === "object") {
		headers["Content-Type"] = "application/json";
		payload = JSON.stringify(body);
	}
	const res = await fetch(`${base}${path}`, { method, headers, body: payload });
	const text = await res.text();
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

async function listTerms(base, taxonomy, token) {
	const data = await apiJson(base, `/_emdash/api/taxonomies/${taxonomy}/terms?limit=100`, {
		token,
	});
	if (Array.isArray(data)) return data;
	return data.items ?? data.terms ?? [];
}

async function downloadPhoto(photoId, destPath) {
	const url = unsplashUrl(photoId);
	const res = await fetch(url, {
		headers: { "User-Agent": "DigiMenuDemo/1.0 (demo menu images)" },
		redirect: "follow",
	});
	if (!res.ok) throw new Error(`Download ${photoId} → ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length < 5000 || buf[0] !== 0xff || buf[1] !== 0xd8) {
		throw new Error(`Not a JPEG for ${photoId} (${buf.length} bytes)`);
	}
	await writeFile(destPath, buf);
	return destPath;
}

async function uploadMedia(base, filePath, alt, token) {
	const buf = await readFile(filePath);
	const form = new FormData();
	form.append("file", new Blob([buf], { type: "image/jpeg" }), basename(filePath));
	if (alt) form.append("alt", alt);
	const data = await apiJson(base, "/_emdash/api/media", {
		method: "POST",
		token,
		formData: form,
	});
	const item = data.item ?? data;
	if (!item?.id) throw new Error(`Upload missing id: ${JSON.stringify(data).slice(0, 300)}`);
	const storageKey = item.storageKey ?? item.storage_key;
	const src =
		item.url ?? item.src ?? (storageKey ? `/_emdash/api/media/file/${storageKey}` : undefined);
	return {
		id: item.id,
		src,
		url: item.url ?? src,
		alt,
		width: item.width ?? 800,
		height: item.height ?? 1000,
	};
}

async function getContent(base, collection, id, token) {
	return apiJson(base, `/_emdash/api/content/${collection}/${encodeURIComponent(id)}`, { token });
}

async function updateContent(base, collection, id, data, token, rev) {
	return apiJson(base, `/_emdash/api/content/${collection}/${encodeURIComponent(id)}`, {
		method: "PUT",
		token,
		body: { data, ...(rev ? { _rev: rev } : {}) },
	});
}

async function ensurePublished(base, collection, id, token) {
	try {
		await apiJson(base, `/_emdash/api/content/${collection}/${encodeURIComponent(id)}/publish`, {
			method: "POST",
			token,
		});
	} catch {
		/* already published or endpoint variant */
	}
}

async function processTarget(name, base, token, dryRun, onlyMissing) {
	console.log(`\n=== ${name} (${base}) ===`);
	const productos = await listAllContent(base, "productos", token);
	const restaurantes = await listAllContent(base, "restaurantes", token);
	const terms = await listTerms(base, "categoria", token);
	const finca = restaurantes.find((r) => r.slug === "finca") ?? restaurantes[0];
	if (!finca) throw new Error("No restaurant found");

	console.log(`Productos: ${productos.length}, categorías: ${terms.length}`);

	const photoCache = new Map(); // photoId -> local path
	await mkdir(CACHE_DIR, { recursive: true });

	async function mediaFor(slug, poolName, alt) {
		const photoId = photoIdFor(slug, poolName);
		let path = photoCache.get(photoId);
		if (!path) {
			path = join(CACHE_DIR, `${photoId}.jpg`);
			try {
				const existing = await readFile(path);
				if (existing.length < 5000) throw new Error("too small");
			} catch {
				console.log(`  ↓ ${photoId}`);
				if (!dryRun) await downloadPhoto(photoId, path);
			}
			photoCache.set(photoId, path);
		}
		if (dryRun) return { id: `dry-${photoId}`, src: unsplashUrl(photoId), alt, width: 800, height: 1000 };
		return uploadMedia(base, path, alt, token);
	}

	let ok = 0;
	let fail = 0;
	let skipped = 0;
	for (const p of productos) {
		const slug = p.slug ?? p.id;
		const nombre = p.data?.nombre ?? slug;
		if (onlyMissing && p.data?.imagen?.id) {
			skipped++;
			continue;
		}
		const pool = poolForSlug(slug);
		try {
			const imagen = await mediaFor(slug, pool, nombre);
			if (!dryRun) {
				const got = await getContent(base, "productos", p.id, token);
				const rev = got._rev ?? got.item?._rev ?? got.rev;
				await updateContent(base, "productos", p.id, { imagen }, token, rev);
				await ensurePublished(base, "productos", p.id, token);
			}
			ok++;
			console.log(`  ✓ producto ${slug} [${pool}]`);
		} catch (e) {
			fail++;
			console.error(`  ✗ producto ${slug}: ${e.message}`);
		}
	}

	const existingMeta = finca.data?.category_meta ?? {};
	const categoryMeta = { ...existingMeta };
	for (const term of terms) {
		const slug = term.slug;
		if (onlyMissing && existingMeta[term.id]?.cover?.id) {
			skipped++;
			continue;
		}
		const pool = CATEGORY_POOL[slug] ?? poolForSlug(slug);
		try {
			const cover = await mediaFor(`cat-${slug}`, pool, term.label ?? slug);
			categoryMeta[term.id] = {
				...(categoryMeta[term.id] ?? {}),
				cover,
			};
			ok++;
			console.log(`  ✓ categoría ${slug} [${pool}]`);
		} catch (e) {
			fail++;
			console.error(`  ✗ categoría ${slug}: ${e.message}`);
		}
	}

	if (!dryRun) {
		const got = await getContent(base, "restaurantes", finca.id, token);
		const rev = got._rev ?? got.item?._rev ?? got.rev;
		await updateContent(
			base,
			"restaurantes",
			finca.id,
			{ category_meta: categoryMeta },
			token,
			rev,
		);
		await ensurePublished(base, "restaurantes", finca.id, token);
		console.log(`  ✓ category_meta saved on ${finca.slug}`);
	}

	console.log(`Done ${name}: ok=${ok} fail=${fail} skipped=${skipped}`);
	return { ok, fail };
}

const args = parseArgs(process.argv);
if (!args.token) {
	console.error("Requires --token or EMDASH_API_TOKEN (PAT for EmDash writes)");
	process.exit(1);
}
const targets = [];
if (args.target === "local" || args.target === "both") {
	targets.push({ name: "local", base: LOCAL_URL, token: args.token });
}
if (args.target === "worker" || args.target === "both") {
	targets.push({ name: "worker", base: WORKER_URL, token: args.token });
}

let totalFail = 0;
for (const t of targets) {
	const r = await processTarget(t.name, t.base, t.token, args.dryRun, args.onlyMissing);
	totalFail += r.fail;
}
process.exit(totalFail > 0 ? 1 : 0);
