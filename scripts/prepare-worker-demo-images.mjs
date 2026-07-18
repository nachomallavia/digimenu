#!/usr/bin/env node
/**
 * Worker path without HTTP PAT:
 * 1) Upload unique 4:5 JPEGs to R2 (wrangler)
 * 2) Write tmp/worker-r2-plan.json for MCP media_create + content_update
 *
 * Usage: node scripts/prepare-worker-demo-images.mjs
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE_DIR = join(ROOT, "tmp", "demo-images");
const POOLS = JSON.parse(await readFile(join(__dirname, "demo-image-pools.json"), "utf8"));
const PRODUCTS = JSON.parse(await readFile(join(ROOT, "tmp", "worker-productos.json"), "utf8")).items;

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

const TERMS = [
	{ id: "01KXF97893KSP045YT7EG1T54R", slug: "bowls-de-yogur-griego", label: "BOWLS DE YOGUR GRIEGO" },
	{ id: "01KXF974V4P6VFBNV8AY17HVDN", slug: "cafe-espresso-leche", label: "CAFÉ ESPRESSO + LECHE" },
	{ id: "01KXF973PQF6XAG4ATC35XSTVY", slug: "cafe-solo", label: "CAFÉ SOLO" },
	{ id: "01KXF96Z314PJJKYQRR3GMRJPZ", slug: "cervezas-kraken-473ml", label: "CERVEZAS KRAKEN 473ML" },
	{ id: "01KXF972JFEKZZZQ90W5Z2AEMS", slug: "filtrados", label: "FILTRADOS" },
	{ id: "01KXF975ZMQHH3CW9BA6VGJPV3", slug: "horneados", label: "HORNEADOS" },
	{ id: "01KXF97AWMRPAXBZ8CCJHWKHEK", slug: "postres", label: "POSTRES" },
	{ id: "01KXF96XS7HWJZP1HQREGR4XYD", slug: "sin-alcohol", label: "SIN ALCOHOL" },
	{ id: "01KXF9773KJ23WZ3HTJ0YMZNKM", slug: "sin-cafe", label: "SIN CAFÉ" },
	{ id: "01KXF97D4BWP273YEY281YR5AK", slug: "sandwiches-especiales", label: "SÁNDWICHES ESPECIALES" },
	{ id: "01KXF96WKZCGTC1Y7NM1R4G832", slug: "tapeos", label: "TAPEOS" },
	{ id: "01KXF979DZD4QZ3K4NSMN12XX2", slug: "tortas-y-alfajores", label: "TORTAS Y ALFAJORES" },
	{ id: "01KXF97C100NF6TEK8YW26SEKG", slug: "tostones-y-sandwiches", label: "TOSTONES Y SÁNDWICHES" },
	{ id: "01KXF970663080EP0W9N01THXX", slug: "tragos", label: "TRAGOS" },
	{ id: "01KXF971DZFHY3T2K2DKPFEGTK", slug: "whiskys", label: "WHISKYS" },
];

function hashIndex(slug, n) {
	return createHash("sha1").update(slug).digest().readUInt32BE(0) % n;
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

async function ensurePhoto(photoId) {
	await mkdir(CACHE_DIR, { recursive: true });
	const path = join(CACHE_DIR, `${photoId}.jpg`);
	try {
		const buf = await readFile(path);
		if (buf.length >= 5000) return path;
	} catch {
		/* download */
	}
	const url = `https://images.unsplash.com/${photoId}?${CROP}`;
	const res = await fetch(url, { headers: { "User-Agent": "DigiMenuDemo/1.0" } });
	if (!res.ok) throw new Error(`download ${photoId} ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length < 5000) throw new Error(`bad jpeg ${photoId}`);
	await writeFile(path, buf);
	return path;
}

function ulidish() {
	const t = Date.now().toString(16).toUpperCase().padStart(10, "0");
	const r = createHash("sha1").update(Math.random().toString()).digest("hex").slice(0, 16).toUpperCase();
	return `01${t}${r}`.slice(0, 26);
}

const photoToKey = new Map();
const products = [];
for (const p of PRODUCTS) {
	const slug = p.slug;
	const pool = poolForSlug(slug);
	const photoId = photoIdFor(slug, pool);
	products.push({
		id: p.id,
		slug,
		nombre: p.data.nombre,
		pool,
		photoId,
	});
	if (!photoToKey.has(photoId)) photoToKey.set(photoId, null);
}

const categories = [];
for (const term of TERMS) {
	const pool = CATEGORY_POOL[term.slug] ?? poolForSlug(term.slug);
	const photoId = photoIdFor(`cat-${term.slug}`, pool);
	categories.push({ ...term, pool, photoId });
	if (!photoToKey.has(photoId)) photoToKey.set(photoId, null);
}

console.log(`Unique photos: ${photoToKey.size}`);
for (const photoId of photoToKey.keys()) {
	const path = await ensurePhoto(photoId);
	const storageKey = `${ulidish()}.jpg`;
	const size = (await readFile(path)).length;
	console.log(`R2 ← ${photoId} → ${storageKey}`);
	const r = spawnSync(
		"npx",
		[
			"wrangler",
			"r2",
			"object",
			"put",
			`digimenu-media/${storageKey}`,
			`--file=${path}`,
			"--content-type=image/jpeg",
			"--remote",
		],
		{ cwd: ROOT, encoding: "utf8" },
	);
	if (r.status !== 0) {
		console.error(r.stdout, r.stderr);
		throw new Error(`wrangler failed for ${photoId}`);
	}
	photoToKey.set(photoId, { storageKey, size, path });
}

const plan = {
	restaurantId: "01KXEQE87VY4Z5ESANZMC5WH7P",
	photos: Object.fromEntries(
		[...photoToKey.entries()].map(([photoId, meta]) => [
			photoId,
			{ storageKey: meta.storageKey, size: meta.size, filename: `${photoId}.jpg` },
		]),
	),
	products: products.map((p) => ({
		...p,
		storageKey: photoToKey.get(p.photoId).storageKey,
		size: photoToKey.get(p.photoId).size,
	})),
	categories: categories.map((c) => ({
		...c,
		storageKey: photoToKey.get(c.photoId).storageKey,
		size: photoToKey.get(c.photoId).size,
	})),
};

const out = join(ROOT, "tmp", "worker-r2-plan.json");
await writeFile(out, JSON.stringify(plan, null, 2));
console.log(`Wrote ${out}`);
