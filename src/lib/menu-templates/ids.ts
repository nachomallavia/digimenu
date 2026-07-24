/** Parse productos.menus / productos.tags JSON arrays of content ULIDs. */
export function parseIdList(raw: unknown): string[] {
	if (!raw) return [];
	if (Array.isArray(raw)) {
		return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
	}
	if (typeof raw === "string") {
		try {
			const parsed = JSON.parse(raw) as unknown;
			return parseIdList(parsed);
		} catch {
			return [];
		}
	}
	return [];
}

export function productBelongsToMenu(
	productMenus: unknown,
	menuId: string,
	opts?: { treatEmptyAsAll?: boolean; soleMenuId?: string },
): boolean {
	const ids = parseIdList(productMenus);
	if (ids.length === 0) {
		if (opts?.treatEmptyAsAll) return true;
		if (opts?.soleMenuId) return menuId === opts.soleMenuId;
		return false;
	}
	return ids.includes(menuId);
}
