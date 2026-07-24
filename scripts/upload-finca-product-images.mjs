#!/usr/bin/env node
/**
 * Upload Finca 4x5 product photos to EmDash media and attach to productos.imagen.
 *
 * Usage:
 *   node scripts/upload-finca-product-images.mjs --target local --dry-run
 *   node scripts/upload-finca-product-images.mjs --target local
 *   node scripts/upload-finca-product-images.mjs --target worker --token "$EMDASH_API_TOKEN"
 *   node scripts/upload-finca-product-images.mjs --target both
 *
 * Env:
 *   EMDASH_API_TOKEN  required for writes (Bearer PAT for that target)
 *   LOCAL_URL         default http://localhost:4321
 *   WORKER_URL        default https://digimenu.nachomallavia.workers.dev
 *
 * Note: a local-only PAT will 401 on Worker. For production without a Worker PAT,
 * upload to R2 (`wrangler r2 object put digimenu-media/{key}`) then MCP
 * media_create + content_update (status published) / content_publish.
 */
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const ASSETS_DIR = join(ROOT, "src", "assets", "productos-4x5");
const MAP_PATH = join(__dirname, "finca-image-map.json");

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

function parseArgs(argv) {
	const out = { target: "local", token: process.env.EMDASH_API_TOKEN ?? "", dryRun: false };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--target") out.target = argv[++i];
		else if (a === "--token") out.token = argv[++i];
		else if (a === "--dry-run") out.dryRun = true;
	}
	return out;
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

async function uploadMedia(base, filePath, alt, token) {
	const buf = await readFile(filePath);
	const form = new FormData();
	form.append("file", new Blob([buf], { type: "image/webp" }), basename(filePath));
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
		width: item.width,
		height: item.height,
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

async function loadPlan() {
	const map = JSON.parse(await readFile(MAP_PATH, "utf8"));
	const diskFiles = (await readdir(ASSETS_DIR)).filter((f) => f.toLowerCase().endsWith(".webp"));
	const diskSet = new Set(diskFiles);
	const ignore = new Set(map.ignore ?? []);
	const files = map.files ?? {};

	const missingOnDisk = [];
	for (const name of Object.keys(files)) {
		if (!diskSet.has(name)) missingOnDisk.push(name);
	}

	const unmapped = [];
	for (const name of diskFiles) {
		if (ignore.has(name)) continue;
		if (!(name in files)) unmapped.push(name);
	}

	return { files, ignore, diskFiles, missingOnDisk, unmapped };
}

async function processTarget(name, base, token, dryRun, plan) {
	console.log(`\n=== ${name} (${base}) ===`);
	const productos = await listAllContent(base, "productos", token);
	const restaurantes = await listAllContent(base, "restaurantes", token);
	const finca = restaurantes.find((r) => r.slug === "finca");
	if (!finca) throw new Error("Restaurant slug=finca not found");

	const fincaId = finca.data?.id ?? finca.id;
	const fincaProductos = productos.filter((p) => {
		const rest = p.data?.restaurante;
		return rest === fincaId || rest === finca.id;
	});

	const bySlug = new Map();
	for (const p of fincaProductos) {
		const slug = p.slug ?? p.id;
		bySlug.set(slug, p);
	}

	console.log(`Finca productos: ${fincaProductos.length}`);
	console.log(`Mapped files: ${Object.keys(plan.files).length}`);
	if (plan.missingOnDisk.length) {
		console.warn(`  ! map entries missing on disk: ${plan.missingOnDisk.join(", ")}`);
	}
	if (plan.unmapped.length) {
		console.warn(`  ! disk files not in map/ignore: ${plan.unmapped.join(", ")}`);
	}

	let ok = 0;
	let fail = 0;
	let skipped = 0;
	const matchedSlugs = new Set();

	for (const [filename, slug] of Object.entries(plan.files)) {
		if (plan.missingOnDisk.includes(filename)) {
			fail++;
			console.error(`  ✗ ${filename}: file not on disk`);
			continue;
		}
		const product = bySlug.get(slug);
		if (!product) {
			fail++;
			console.error(`  ✗ ${filename} → ${slug}: product not found`);
			continue;
		}
		if (matchedSlugs.has(slug)) {
			fail++;
			console.error(`  ✗ ${filename} → ${slug}: duplicate slug in map`);
			continue;
		}
		matchedSlugs.add(slug);

		const nombre = product.data?.nombre ?? slug;
		const hadImage = Boolean(product.data?.imagen?.id);
		const filePath = join(ASSETS_DIR, filename);

		try {
			if (dryRun) {
				ok++;
				console.log(`  ○ ${filename} → ${slug}${hadImage ? " (replace)" : " (new)"}`);
				continue;
			}
			const imagen = await uploadMedia(base, filePath, nombre, token);
			const got = await getContent(base, "productos", product.id, token);
			const rev = got._rev ?? got.item?._rev ?? got.rev;
			await updateContent(base, "productos", product.id, { imagen }, token, rev);
			await ensurePublished(base, "productos", product.id, token);
			ok++;
			console.log(`  ✓ ${filename} → ${slug}${hadImage ? " (replaced)" : ""}`);
		} catch (e) {
			fail++;
			console.error(`  ✗ ${filename} → ${slug}: ${e.message}`);
		}
	}

	const withoutFincaPhoto = fincaProductos
		.filter((p) => !matchedSlugs.has(p.slug ?? p.id))
		.map((p) => p.slug ?? p.id);

	console.log(
		`Done ${name}: ok=${ok} fail=${fail} skipped=${skipped} withoutFincaPhoto=${withoutFincaPhoto.length}`,
	);
	if (dryRun || withoutFincaPhoto.length) {
		console.log(`  (keep Unsplash) ${withoutFincaPhoto.join(", ")}`);
	}
	return { ok, fail };
}

const args = parseArgs(process.argv);
if (!args.token && !args.dryRun) {
	console.error("Requires --token or EMDASH_API_TOKEN (PAT for EmDash writes)");
	process.exit(1);
}

const plan = await loadPlan();
console.log(`Assets: ${ASSETS_DIR}`);
console.log(`Disk webp: ${plan.diskFiles.length}, mapped: ${Object.keys(plan.files).length}, ignore: ${plan.ignore.size}`);

const targets = [];
if (args.target === "local" || args.target === "both") {
	targets.push({ name: "local", base: LOCAL_URL, token: args.token });
}
if (args.target === "worker" || args.target === "both") {
	targets.push({ name: "worker", base: WORKER_URL, token: args.token });
}
if (!targets.length) {
	console.error(`Unknown --target ${args.target} (use local|worker|both)`);
	process.exit(1);
}

let totalFail = 0;
for (const t of targets) {
	const r = await processTarget(t.name, t.base, t.token, args.dryRun, plan);
	totalFail += r.fail;
}
process.exit(totalFail > 0 ? 1 : 0);
