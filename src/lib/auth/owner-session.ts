import type { AstroCookies } from "astro";

export const OWNER_SESSION_COOKIE = "digimenu_owner";
export const OWNER_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 3; // 3 days

export type OwnerSessionPayload = {
	userId: string;
	email: string | undefined;
	restaurantId: string;
	restaurantSlug: string;
	restaurantName: string;
	iat: number;
	exp: number;
};

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

export async function sealOwnerSession(
	payload: Omit<OwnerSessionPayload, "iat" | "exp"> & { iat?: number; exp?: number },
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
	payload: Omit<OwnerSessionPayload, "iat" | "exp">,
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
