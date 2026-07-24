import type { AstroCookies } from "astro";

export const OWNER_SESSION_COOKIE = "digimenu_owner";
export const OWNER_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 3; // 3 days

/** Logo cached in the snapshot: `null` = no logo; `undefined` = unknown (old cookie). */
export type OwnerSnapshotLogo = { src: string; alt?: string } | null;

/** Restaurant fields cached in the owner cookie for light /app form GETs. */
export type OwnerRestaurantSnapshot = {
	nombre: string;
	descripcion?: string | null;
	menu_layout?: unknown;
	theme?: unknown;
	logo_light?: OwnerSnapshotLogo;
	logo_dark?: OwnerSnapshotLogo;
};

export type OwnerSessionPayload = {
	userId: string;
	email: string | undefined;
	restaurantId: string;
	restaurantSlug: string;
	restaurantName: string;
	/** Optional — missing on cookies issued before snapshot support */
	restaurantSnapshot?: OwnerRestaurantSnapshot;
	iat: number;
	exp: number;
};

export type OwnerSessionWritePayload = Omit<OwnerSessionPayload, "iat" | "exp">;

function getSessionSecret(): string {
	const secret =
		(import.meta.env.DIGIMENU_SESSION_SECRET as string | undefined) ||
		(import.meta.env.EMDASH_ENCRYPTION_KEY as string | undefined);
	if (!secret) {
		throw new Error(
			"Missing DIGIMENU_SESSION_SECRET (or EMDASH_ENCRYPTION_KEY fallback) for owner session cookie",
		);
	}
	return secret;
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/");
	const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
	const binary = atob(padded + pad);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

async function hmacSign(secret: string, data: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
	return toBase64Url(new Uint8Array(sig));
}

async function hmacVerify(secret: string, data: string, signature: string): Promise<boolean> {
	const expected = await hmacSign(secret, data);
	if (expected.length !== signature.length) return false;
	let mismatch = 0;
	for (let i = 0; i < expected.length; i++) {
		mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
	}
	return mismatch === 0;
}

function parseSnapshotLogo(raw: unknown): OwnerSnapshotLogo | undefined {
	if (raw === null) return null;
	if (!raw || typeof raw !== "object") return undefined;
	const obj = raw as Record<string, unknown>;
	if (typeof obj.src !== "string") return undefined;
	return {
		src: obj.src,
		alt: typeof obj.alt === "string" ? obj.alt : undefined,
	};
}

function parseSnapshot(raw: unknown): OwnerRestaurantSnapshot | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const obj = raw as Record<string, unknown>;
	if (typeof obj.nombre !== "string") return undefined;
	return {
		nombre: obj.nombre,
		descripcion:
			obj.descripcion === undefined
				? undefined
				: obj.descripcion === null
					? null
					: typeof obj.descripcion === "string"
						? obj.descripcion
						: undefined,
		menu_layout: obj.menu_layout,
		theme: obj.theme,
		// Prefer new fields; fall back to legacy `logo` → light.
		logo_light: (() => {
			const light = parseSnapshotLogo(obj.logo_light);
			return light !== undefined ? light : parseSnapshotLogo(obj.logo);
		})(),
		logo_dark: parseSnapshotLogo(obj.logo_dark),
	};
}

export async function sealOwnerSession(
	payload: OwnerSessionWritePayload & { iat?: number; exp?: number },
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const full: OwnerSessionPayload = {
		userId: payload.userId,
		email: payload.email,
		restaurantId: payload.restaurantId,
		restaurantSlug: payload.restaurantSlug,
		restaurantName: payload.restaurantName,
		iat: payload.iat ?? now,
		exp: payload.exp ?? now + OWNER_SESSION_MAX_AGE_SEC,
	};
	if (payload.restaurantSnapshot) {
		full.restaurantSnapshot = payload.restaurantSnapshot;
	}
	const body = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
	const sig = await hmacSign(getSessionSecret(), body);
	return `${body}.${sig}`;
}

export async function unsealOwnerSession(token: string): Promise<OwnerSessionPayload | null> {
	const parts = token.split(".");
	if (parts.length !== 2) return null;
	const [body, sig] = parts;
	if (!body || !sig) return null;

	try {
		const ok = await hmacVerify(getSessionSecret(), body, sig);
		if (!ok) return null;
		const json = new TextDecoder().decode(fromBase64Url(body));
		const payload = JSON.parse(json) as OwnerSessionPayload;
		if (
			typeof payload.userId !== "string" ||
			typeof payload.restaurantId !== "string" ||
			typeof payload.restaurantSlug !== "string" ||
			typeof payload.restaurantName !== "string" ||
			typeof payload.exp !== "number"
		) {
			return null;
		}
		const now = Math.floor(Date.now() / 1000);
		if (payload.exp < now) return null;
		const snapshot = parseSnapshot(payload.restaurantSnapshot);
		if (snapshot) payload.restaurantSnapshot = snapshot;
		else delete payload.restaurantSnapshot;
		return payload;
	} catch {
		return null;
	}
}

function cookieOptions(maxAge = OWNER_SESSION_MAX_AGE_SEC) {
	return {
		path: "/app",
		httpOnly: true,
		sameSite: "lax" as const,
		secure: import.meta.env.PROD === true,
		maxAge,
	};
}

export async function setOwnerSessionCookie(
	cookies: AstroCookies,
	payload: OwnerSessionWritePayload,
): Promise<void> {
	const token = await sealOwnerSession(payload);
	cookies.set(OWNER_SESSION_COOKIE, token, cookieOptions());
}

export function clearOwnerSessionCookie(cookies: AstroCookies): void {
	cookies.delete(OWNER_SESSION_COOKIE, { path: "/app" });
	cookies.set(OWNER_SESSION_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}

export async function readOwnerSessionCookie(
	cookies: AstroCookies,
): Promise<OwnerSessionPayload | null> {
	const raw = cookies.get(OWNER_SESSION_COOKIE)?.value;
	if (!raw) return null;
	return unsealOwnerSession(raw);
}
