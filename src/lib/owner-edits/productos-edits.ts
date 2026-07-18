import { atom, map } from "nanostores";
import {
	discardAll,
	hasAnyFieldErrors,
	pendingCount,
	removeId,
	setField,
	type PatchValue,
} from "./pending-map";
export { showToast, clearToast, toast } from "./toast-store";

export type ProductoPatch = {
	nombre?: string;
	precio?: number;
	categoria?: string | null;
};

export type ProductoField = keyof ProductoPatch;

export const pending = map<Record<string, ProductoPatch>>({});
export const fieldErrors = map<Record<string, Partial<Record<ProductoField, string>>>>({});
export const saving = atom(false);
export const searchQuery = atom("");

export type PageSize = 10 | 20 | 50 | 100 | "all";
export const pageSize = atom<PageSize>(20);
export const currentPage = atom(1);
/** Empty array = no filter (show all). Includes `""` for Sin categoría. */
export const selectedCategorias = atom<string[]>([]);

export const productosPendingCount = pendingCount(pending);
export const productosHasFieldErrors = hasAnyFieldErrors(fieldErrors);

export function setProductoFieldError(
	id: string,
	field: ProductoField,
	message: string | null,
): void {
	const next = { ...fieldErrors.get() };
	const row = { ...(next[id] ?? {}) };
	if (message) {
		row[field] = message;
	} else {
		delete row[field];
	}
	if (Object.keys(row).length === 0) {
		delete next[id];
	} else {
		next[id] = row;
	}
	fieldErrors.set(next);
}

export function setProductoField(
	id: string,
	field: ProductoField,
	value: ProductoPatch[ProductoField],
	original: PatchValue | undefined,
): void {
	setField(pending, id, field, value, original);
}

export function discardProductoEdits(): void {
	discardAll(pending);
	fieldErrors.set({});
}

export function dropProductoPending(id: string): void {
	removeId(pending, id);
	const errs = { ...fieldErrors.get() };
	delete errs[id];
	fieldErrors.set(errs);
}

/**
 * After a successful (or partial) save: drop saved ids from pending and
 * clear their field errors. Caller updates DOM `data-original-*`.
 */
export function markProductosSaved(ids: string[]): void {
	const nextPending = { ...pending.get() };
	const nextErrors = { ...fieldErrors.get() };
	for (const id of ids) {
		delete nextPending[id];
		delete nextErrors[id];
	}
	pending.set(nextPending);
	fieldErrors.set(nextErrors);
}
