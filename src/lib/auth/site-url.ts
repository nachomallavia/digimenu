/**
 * Public site origin for auth redirects (magic link, OAuth).
 * Prefer PUBLIC_SITE_URL in production so Workers Host quirks cannot
 * send Supabase a localhost redirect.
 */
export function getPublicSiteOrigin(request: Request): string {
	const configured = (import.meta.env.PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "");
	if (configured) return configured;
	return new URL(request.url).origin;
}

export function getOwnerAuthCallbackUrl(request: Request): string {
	return `${getPublicSiteOrigin(request)}/app/auth/callback`;
}
