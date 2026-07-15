/**
 * Browser cache for owner list data (sessionStorage + stale-while-revalidate).
 * Keeps /app navigations light: SSR skips EmDash lists; client paints from cache.
 */

export type OwnerProductoRow = {
	slug: string;
	id: string;
	nombre: string;
	precio: number;
	descripcion?: string | null;
};

export type OwnerCategoriaRow = {
	id: string;
	slug: string;
	label: string;
};

const PREFIX = "digimenu:owner:";

export function productosCacheKey(restaurantId: string) {
	return `${PREFIX}productos:${restaurantId}`;
}

export function categoriasCacheKey(restaurantId: string) {
	return `${PREFIX}categorias:${restaurantId}`;
}

export function readJsonCache<T>(key: string): T | null {
	try {
		const raw = sessionStorage.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export function writeJsonCache(key: string, value: unknown): void {
	try {
		sessionStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Quota / private mode — ignore
	}
}

export function bustOwnerListCaches(restaurantId: string): void {
	try {
		sessionStorage.removeItem(productosCacheKey(restaurantId));
		sessionStorage.removeItem(categoriasCacheKey(restaurantId));
	} catch {
		// ignore
	}
}

export function shouldBustFromUrl(url: URL = new URL(location.href)): boolean {
	return (
		url.searchParams.get("saved") === "1" ||
		url.searchParams.get("fresh") === "1" ||
		url.searchParams.has("action")
	);
}

export async function fetchProductos(): Promise<OwnerProductoRow[]> {
	const res = await fetch("/app/api/productos", { credentials: "same-origin" });
	if (!res.ok) throw new Error(`productos ${res.status}`);
	const data = (await res.json()) as { items?: OwnerProductoRow[]; error?: string };
	if (data.error || !Array.isArray(data.items)) throw new Error(data.error ?? "list failed");
	return data.items.map((i) => ({
		slug: i.slug,
		id: i.id,
		nombre: i.nombre,
		precio: i.precio,
		descripcion: i.descripcion ?? null,
	}));
}

export async function fetchCategorias(): Promise<OwnerCategoriaRow[]> {
	const res = await fetch("/app/api/categorias", { credentials: "same-origin" });
	if (!res.ok) throw new Error(`categorias ${res.status}`);
	const data = (await res.json()) as { items?: OwnerCategoriaRow[]; error?: string };
	if (data.error || !Array.isArray(data.items)) throw new Error(data.error ?? "list failed");
	return data.items;
}

/** Paint cache immediately, then refresh from network. */
export async function swrLoad<T>(opts: {
	key: string;
	bust?: boolean;
	fetcher: () => Promise<T>;
	onData: (data: T, source: "cache" | "network") => void;
	onError?: (err: unknown) => void;
	onLoading?: () => void;
}): Promise<void> {
	if (opts.bust) {
		try {
			sessionStorage.removeItem(opts.key);
		} catch {
			// ignore
		}
	}

	const cached = opts.bust ? null : readJsonCache<T>(opts.key);
	if (cached != null) {
		opts.onData(cached, "cache");
	} else {
		opts.onLoading?.();
	}

	try {
		const fresh = await opts.fetcher();
		writeJsonCache(opts.key, fresh);
		opts.onData(fresh, "network");
	} catch (err) {
		if (cached == null) opts.onError?.(err);
	}
}
