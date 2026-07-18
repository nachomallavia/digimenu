/**
 * Worker-side read-through cache for owner product/category lists.
 * Keyed by restaurantId. Bust on write. 5min TTL safety net.
 * Uses Cache API on Workers; in-memory Map when Cache API is unavailable (local).
 */

export type OwnerListKind = "productos" | "categorias";

const CACHE_NAME = "digimenu-owner-lists";
const MAX_AGE_SEC = 300;

type MemoryEntry = {
	expiresAt: number;
	body: string;
};

const memoryFallback = new Map<string, MemoryEntry>();

function cacheKeyUrl(kind: OwnerListKind, restaurantId: string): string {
	return `https://owner-list-cache.internal/${kind}/${encodeURIComponent(restaurantId)}`;
}

function cacheRequest(kind: OwnerListKind, restaurantId: string): Request {
	return new Request(cacheKeyUrl(kind, restaurantId));
}

async function openCache(): Promise<Cache | null> {
	try {
		if (typeof caches === "undefined" || typeof caches.open !== "function") {
			return null;
		}
		return await caches.open(CACHE_NAME);
	} catch {
		return null;
	}
}

function logDev(event: "hit" | "miss" | "set" | "bust", kind: string, restaurantId: string) {
	if (import.meta.env.DEV) {
		console.debug(`[owner-list-cache] ${event} ${kind} ${restaurantId}`);
	}
}

/**
 * Returns parsed entry array, or null on miss / error.
 */
export async function getCachedList(
	kind: OwnerListKind,
	restaurantId: string,
): Promise<unknown[] | null> {
	const key = cacheKeyUrl(kind, restaurantId);
	const req = cacheRequest(kind, restaurantId);

	const cache = await openCache();
	if (cache) {
		try {
			const hit = await cache.match(req);
			if (hit) {
				const data = (await hit.json()) as { entries?: unknown[] };
				if (Array.isArray(data.entries)) {
					logDev("hit", kind, restaurantId);
					return data.entries;
				}
			}
		} catch {
			// fall through to miss
		}
	} else {
		const mem = memoryFallback.get(key);
		if (mem && mem.expiresAt > Date.now()) {
			try {
				const data = JSON.parse(mem.body) as { entries?: unknown[] };
				if (Array.isArray(data.entries)) {
					logDev("hit", kind, restaurantId);
					return data.entries;
				}
			} catch {
				memoryFallback.delete(key);
			}
		} else if (mem) {
			memoryFallback.delete(key);
		}
	}

	logDev("miss", kind, restaurantId);
	return null;
}

export async function setCachedList(
	kind: OwnerListKind,
	restaurantId: string,
	entries: unknown[],
): Promise<void> {
	const body = JSON.stringify({ entries });
	const req = cacheRequest(kind, restaurantId);
	const key = cacheKeyUrl(kind, restaurantId);

	const cache = await openCache();
	if (cache) {
		try {
			const res = new Response(body, {
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": `max-age=${MAX_AGE_SEC}`,
				},
			});
			await cache.put(req, res);
			logDev("set", kind, restaurantId);
			return;
		} catch {
			// fall through to memory
		}
	}

	memoryFallback.set(key, {
		expiresAt: Date.now() + MAX_AGE_SEC * 1000,
		body,
	});
	logDev("set", kind, restaurantId);
}

export async function bustOwnerListCache(
	restaurantId: string,
	kind: OwnerListKind | "both" = "both",
): Promise<void> {
	const kinds: OwnerListKind[] = kind === "both" ? ["productos", "categorias"] : [kind];
	const cache = await openCache();

	for (const k of kinds) {
		const req = cacheRequest(k, restaurantId);
		const key = cacheKeyUrl(k, restaurantId);
		memoryFallback.delete(key);
		if (cache) {
			try {
				await cache.delete(req);
			} catch {
				// ignore
			}
		}
		logDev("bust", k, restaurantId);
	}
}
