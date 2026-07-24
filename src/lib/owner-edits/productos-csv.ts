import {
	imageSrc,
	uploadMediaViaApi,
	type EmDashCategoria,
	type EmDashImage,
	type EmDashProducto,
} from "@/lib/emdash/client";

export const PRODUCTOS_CSV_HEADERS = [
	"nombre",
	"descripcion",
	"precio",
	"categoria",
	"imagen",
	"id",
	"id_sig",
] as const;

export type ProductoCsvRow = {
	row: number;
	id: string;
	idSig: string;
	nombre: string;
	descripcion: string;
	precio: string;
	categoria: string;
	imagen: string;
};

export type CategoriaSimilar = {
	id: string;
	nombre: string;
	distance: number;
};

export type NewCategoriaPreview = {
	key: string;
	displayName: string;
	similar: CategoriaSimilar[];
};

export type CategoriaResolution =
	| { action: "create" }
	| { action: "use"; categoriaId: string };

export type CategoriaResolutions = Record<string, CategoriaResolution>;

function getCsvSecret(): string {
	const secret =
		(import.meta.env.DIGIMENU_SESSION_SECRET as string | undefined) ||
		(import.meta.env.EMDASH_ENCRYPTION_KEY as string | undefined);
	if (!secret) {
		throw new Error(
			"Missing DIGIMENU_SESSION_SECRET (or EMDASH_ENCRYPTION_KEY) for CSV signatures",
		);
	}
	return secret;
}

async function hmacHexTrunc(secret: string, data: string, len = 16): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
	const bytes = new Uint8Array(sig);
	let hex = "";
	for (const b of bytes) hex += b.toString(16).padStart(2, "0");
	return hex.slice(0, len);
}

export async function signProductoCsvId(
	restaurantId: string,
	productId: string,
): Promise<string> {
	return hmacHexTrunc(getCsvSecret(), `${restaurantId}:${productId}`);
}

export async function verifyProductoCsvId(
	restaurantId: string,
	productId: string,
	signature: string,
): Promise<boolean> {
	if (!productId || !signature) return false;
	const expected = await signProductoCsvId(restaurantId, productId);
	if (expected.length !== signature.length) return false;
	let mismatch = 0;
	for (let i = 0; i < expected.length; i++) {
		mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
	}
	return mismatch === 0;
}

/** Lowercase, strip accents, remove spaces. */
export function normalizeCategoriaKey(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, "");
}

export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	const prev = new Array<number>(b.length + 1);
	const curr = new Array<number>(b.length + 1);
	for (let j = 0; j <= b.length; j++) prev[j] = j;
	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
	}
	return prev[b.length]!;
}

function similarDistanceThreshold(keyLen: number): number {
	if (keyLen <= 2) return 0;
	if (keyLen <= 4) return 1;
	return 2;
}

export function findSimilarCategorias(
	key: string,
	existing: { id: string; nombre: string; key: string }[],
	limit = 3,
): CategoriaSimilar[] {
	const maxDist = similarDistanceThreshold(key.length);
	if (maxDist === 0) return [];
	const scored = existing
		.map((c) => ({
			id: c.id,
			nombre: c.nombre,
			distance: levenshtein(key, c.key),
		}))
		.filter((c) => c.distance > 0 && c.distance <= maxDist)
		.sort((a, b) => a.distance - b.distance || a.nombre.localeCompare(b.nombre));
	return scored.slice(0, limit);
}

export function escapeCsvField(value: string): string {
	if (/[",\n\r]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let i = 0;
	let inQuotes = false;
	const input = text.replace(/^\uFEFF/, "");

	while (i < input.length) {
		const ch = input[i]!;
		if (inQuotes) {
			if (ch === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i += 1;
				continue;
			}
			field += ch;
			i += 1;
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			i += 1;
			continue;
		}
		if (ch === ",") {
			row.push(field);
			field = "";
			i += 1;
			continue;
		}
		if (ch === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
			i += 1;
			continue;
		}
		if (ch === "\r") {
			i += 1;
			continue;
		}
		field += ch;
		i += 1;
	}
	row.push(field);
	if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
		rows.push(row);
	}
	return rows;
}

export function parseProductosCsv(text: string): {
	rows: ProductoCsvRow[];
	error?: string;
} {
	const table = parseCsv(text);
	if (table.length === 0) {
		return { rows: [], error: "CSV vacío." };
	}
	const header = table[0]!.map((h) => h.trim().toLowerCase());
	const idx = (name: string) => header.indexOf(name);
	for (const required of PRODUCTOS_CSV_HEADERS) {
		if (idx(required) < 0) {
			return { rows: [], error: `Falta la columna «${required}».` };
		}
	}

	const rows: ProductoCsvRow[] = [];
	for (let r = 1; r < table.length; r++) {
		const cells = table[r]!;
		const get = (name: (typeof PRODUCTOS_CSV_HEADERS)[number]) =>
			(cells[idx(name)] ?? "").trim();
		const nombre = get("nombre");
		const precio = get("precio");
		const id = get("id");
		const idSig = get("id_sig");
		const descripcion = get("descripcion");
		const categoria = get("categoria");
		const imagen = get("imagen");
		if (!nombre && !precio && !id && !categoria && !descripcion && !imagen) {
			continue;
		}
		rows.push({
			row: r + 1,
			id,
			idSig,
			nombre,
			descripcion,
			precio,
			categoria,
			imagen,
		});
	}
	return { rows };
}

export function absoluteImageUrl(src: string | undefined, origin: string): string {
	if (!src) return "";
	if (/^https?:\/\//i.test(src)) return src;
	try {
		return new URL(src, origin).href;
	} catch {
		return src;
	}
}

export async function serializeProductosCsv(
	productos: EmDashProducto[],
	categorias: EmDashCategoria[],
	restaurantId: string,
	origin: string,
): Promise<string> {
	const catById = new Map(categorias.map((c) => [c.data.id, c.data.nombre]));
	const lines = [PRODUCTOS_CSV_HEADERS.join(",")];
	for (const p of productos) {
		const id = p.data.id;
		const idSig = await signProductoCsvId(restaurantId, id);
		const catName = p.data.categoria ? (catById.get(p.data.categoria) ?? "") : "";
		const img = absoluteImageUrl(imageSrc(p.data.imagen), origin);
		lines.push(
			[
				escapeCsvField(p.data.nombre ?? ""),
				escapeCsvField(p.data.descripcion ?? ""),
				escapeCsvField(String(p.data.precio ?? "")),
				escapeCsvField(catName),
				escapeCsvField(img),
				escapeCsvField(id),
				escapeCsvField(idSig),
			].join(","),
		);
	}
	return `\uFEFF${lines.join("\n")}\n`;
}

export function collectCsvCategoriaPlan(
	rows: ProductoCsvRow[],
	existingCategorias: EmDashCategoria[],
): {
	exactByKey: Map<string, string>;
	newCategorias: NewCategoriaPreview[];
} {
	const existing = existingCategorias.map((c) => ({
		id: c.data.id,
		nombre: c.data.nombre,
		key: normalizeCategoriaKey(c.data.nombre),
	}));
	const exactByKey = new Map(existing.map((c) => [c.key, c.id]));
	const newByKey = new Map<string, string>();

	for (const row of rows) {
		const raw = row.categoria.trim();
		if (!raw) continue;
		const key = normalizeCategoriaKey(raw);
		if (!key) continue;
		if (exactByKey.has(key)) continue;
		if (!newByKey.has(key)) newByKey.set(key, raw);
	}

	const newCategorias: NewCategoriaPreview[] = [...newByKey.entries()].map(
		([key, displayName]) => ({
			key,
			displayName,
			similar: findSimilarCategorias(key, existing),
		}),
	);

	return { exactByKey, newCategorias };
}

function isPrivateHostname(hostname: string): boolean {
	const host = hostname.toLowerCase();
	if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
		return true;
	}
	if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
	if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
	if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
	if (/^169\.254\.\d+\.\d+$/.test(host)) return true;
	return false;
}

export function assertSafeImageFetchUrl(raw: string, allowedOrigin: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error("URL de imagen inválida.");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("La imagen debe ser http(s).");
	}
	let allowed: URL;
	try {
		allowed = new URL(allowedOrigin);
	} catch {
		throw new Error("Origen no válido.");
	}
	if (url.origin === allowed.origin) return url;
	if (isPrivateHostname(url.hostname)) {
		throw new Error("URL de imagen no permitida.");
	}
	return url;
}

function normalizeUrlForCompare(raw: string): string {
	try {
		const u = new URL(raw);
		u.hash = "";
		return u.href.replace(/\/$/, "");
	} catch {
		return raw.trim().replace(/\/$/, "");
	}
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Returns image value to write, or `undefined` to leave unchanged.
 * Empty csvUrl → undefined (no change / no image on create).
 */
export async function resolveProductoImagenFromUrl(
	current: EmDashImage,
	csvUrl: string,
	origin: string,
	alt: string,
): Promise<EmDashImage | undefined> {
	const trimmed = csvUrl.trim();
	if (!trimmed) return undefined;

	const currentSrc = absoluteImageUrl(imageSrc(current), origin);
	if (currentSrc && normalizeUrlForCompare(currentSrc) === normalizeUrlForCompare(trimmed)) {
		return undefined;
	}

	const url = assertSafeImageFetchUrl(trimmed, origin);
	const res = await fetch(url.href, {
		redirect: "follow",
		headers: { Accept: "image/*,*/*" },
	});
	if (!res.ok) {
		throw new Error(`No se pudo descargar la imagen (${res.status}).`);
	}
	const len = Number(res.headers.get("content-length") ?? "0");
	if (len > MAX_IMAGE_BYTES) {
		throw new Error("Imagen demasiado grande (máx. 10MB).");
	}
	const buf = await res.arrayBuffer();
	if (buf.byteLength > MAX_IMAGE_BYTES) {
		throw new Error("Imagen demasiado grande (máx. 10MB).");
	}
	const contentType = res.headers.get("content-type") ?? "application/octet-stream";
	const ext =
		contentType.includes("png")
			? "png"
			: contentType.includes("webp")
				? "webp"
				: contentType.includes("gif")
					? "gif"
					: "jpg";
	const file = new File([buf], `import.${ext}`, { type: contentType.split(";")[0]!.trim() });
	return uploadMediaViaApi(file, alt);
}
