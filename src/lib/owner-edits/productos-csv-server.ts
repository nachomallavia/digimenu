import {
	assertCategoriaBelongsToRestaurant,
	assertProductoBelongsToRestaurant,
	bustOwnerListCache,
	createCategoriaViaApi,
	createProductoViaApi,
	getCategoriaBySlug,
	getProductoBySlug,
	listCategoriasForRestaurant,
	listProductosForRestaurant,
	updateProductoViaApi,
	type EmDashCategoria,
	type ProductoUpdateData,
} from "@/lib/emdash/client";
import {
	collectCsvCategoriaPlan,
	normalizeCategoriaKey,
	parseProductosCsv,
	resolveProductoImagenFromUrl,
	serializeProductosCsv,
	verifyProductoCsvId,
	type CategoriaResolutions,
	type NewCategoriaPreview,
	type ProductoCsvRow,
} from "./productos-csv";

const MAX_CSV_ROWS = 200;

export async function buildProductosCsvExport(
	restaurantId: string,
	origin: string,
): Promise<string> {
	const [{ entries: productos }, { entries: categorias }] = await Promise.all([
		listProductosForRestaurant(restaurantId),
		listCategoriasForRestaurant(restaurantId),
	]);
	return serializeProductosCsv(productos, categorias, restaurantId, origin);
}

export async function previewProductosCsvImport(
	csv: string,
	restaurantId: string,
): Promise<
	| {
			ok: true;
			rowCount: number;
			updateCount: number;
			newProductos: string[];
			newCategorias: NewCategoriaPreview[];
	  }
	| { ok: false; error: string }
> {
	const parsed = parseProductosCsv(csv);
	if (parsed.error) return { ok: false, error: parsed.error };
	if (parsed.rows.length > MAX_CSV_ROWS) {
		return { ok: false, error: `Máximo ${MAX_CSV_ROWS} filas por importación.` };
	}
	const { entries: categorias } = await listCategoriasForRestaurant(restaurantId);
	const { newCategorias } = collectCsvCategoriaPlan(parsed.rows, categorias);
	const newProductos = parsed.rows
		.filter((r) => !r.id.trim())
		.map((r) => r.nombre.trim() || `(fila ${r.row})`);
	const updateCount = parsed.rows.filter((r) => r.id.trim()).length;
	return {
		ok: true,
		rowCount: parsed.rows.length,
		updateCount,
		newProductos,
		newCategorias,
	};
}

function parseResolutions(raw: unknown): CategoriaResolutions | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const out: CategoriaResolutions = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!key || !value || typeof value !== "object" || Array.isArray(value)) return null;
		const action = (value as { action?: unknown }).action;
		if (action === "create") {
			out[key] = { action: "create" };
			continue;
		}
		if (action === "use") {
			const categoriaId = String((value as { categoriaId?: unknown }).categoriaId ?? "");
			if (!categoriaId) return null;
			out[key] = { action: "use", categoriaId };
			continue;
		}
		return null;
	}
	return out;
}

async function resolveCategoriaMap(
	rows: ProductoCsvRow[],
	categorias: EmDashCategoria[],
	resolutions: CategoriaResolutions,
	restaurantId: string,
): Promise<
	| { ok: true; byKey: Map<string, string | null>; categoriasCreated: number; newKeys: string[] }
	| { ok: false; status: number; error: string; newCategorias?: NewCategoriaPreview[] }
> {
	const { exactByKey, newCategorias } = collectCsvCategoriaPlan(rows, categorias);
	const newKeys = newCategorias.map((n) => n.key);

	for (const key of newKeys) {
		if (!(key in resolutions)) {
			return {
				ok: false,
				status: 409,
				error: "Faltan resoluciones para categorías nuevas.",
				newCategorias,
			};
		}
	}

	const byKey = new Map<string, string | null>(exactByKey);
	let categoriasCreated = 0;
	let nextOrden =
		categorias.reduce((max, c) => Math.max(max, c.data.orden ?? 0), 0) + 1;

	for (const preview of newCategorias) {
		const res = resolutions[preview.key]!;
		if (res.action === "use") {
			const { entry: cat } = await getCategoriaBySlug(res.categoriaId);
			if (!cat || !assertCategoriaBelongsToRestaurant(cat, restaurantId)) {
				return {
					ok: false,
					status: 400,
					error: `Categoría inválida para «${preview.displayName}».`,
				};
			}
			byKey.set(preview.key, cat.data.id);
			continue;
		}
		const created = await createCategoriaViaApi(
			{
				nombre: preview.displayName,
				restauranteId: restaurantId,
				orden: nextOrden++,
			},
			{ skipCacheBust: true },
		);
		const newId = created.item?.id;
		if (!newId) {
			return {
				ok: false,
				status: 500,
				error: `No se pudo crear la categoría «${preview.displayName}».`,
			};
		}
		byKey.set(preview.key, newId);
		categoriasCreated += 1;
	}

	return { ok: true, byKey, categoriasCreated, newKeys };
}

export async function importProductosCsv(opts: {
	csv: string;
	restaurantId: string;
	origin: string;
	categoriaResolutionsRaw: unknown;
}): Promise<Response> {
	const parsed = parseProductosCsv(opts.csv);
	if (parsed.error) {
		return Response.json({ ok: false, error: parsed.error }, { status: 400 });
	}
	if (parsed.rows.length === 0) {
		return Response.json({ ok: true, created: 0, updated: 0, categoriasCreated: 0, failed: [] });
	}
	if (parsed.rows.length > MAX_CSV_ROWS) {
		return Response.json(
			{ ok: false, error: `Máximo ${MAX_CSV_ROWS} filas por importación.` },
			{ status: 400 },
		);
	}

	const resolutions = parseResolutions(opts.categoriaResolutionsRaw ?? {});
	if (!resolutions) {
		return Response.json(
			{ ok: false, error: "categoriaResolutions inválido." },
			{ status: 400 },
		);
	}

	const { entries: categorias } = await listCategoriasForRestaurant(opts.restaurantId);
	const catResult = await resolveCategoriaMap(
		parsed.rows,
		categorias,
		resolutions,
		opts.restaurantId,
	);
	if (!catResult.ok) {
		return Response.json(
			{
				ok: false,
				error: catResult.error,
				newCategorias: catResult.newCategorias,
			},
			{ status: catResult.status },
		);
	}

	const failed: { row: number; error: string }[] = [];
	let created = 0;
	let updated = 0;
	let wrote = catResult.categoriasCreated > 0;

	for (const row of parsed.rows) {
		try {
			const nombre = row.nombre.trim();
			const precio = Number(row.precio);
			if (!nombre) {
				failed.push({ row: row.row, error: "Nombre obligatorio." });
				continue;
			}
			if (!Number.isFinite(precio) || precio < 0) {
				failed.push({ row: row.row, error: "Precio inválido." });
				continue;
			}
			const precioInt = Math.round(precio);

			let categoriaId: string | null = null;
			if (row.categoria.trim()) {
				const key = normalizeCategoriaKey(row.categoria);
				if (!key || !catResult.byKey.has(key)) {
					failed.push({ row: row.row, error: "Categoría no resuelta." });
					continue;
				}
				categoriaId = catResult.byKey.get(key) ?? null;
			}

			if (row.id) {
				const sigOk = await verifyProductoCsvId(
					opts.restaurantId,
					row.id,
					row.idSig,
				);
				if (!sigOk) {
					failed.push({ row: row.row, error: "Id alterado o inválido." });
					continue;
				}
				const { entry } = await getProductoBySlug(row.id);
				if (!entry || !assertProductoBelongsToRestaurant(entry, opts.restaurantId)) {
					failed.push({ row: row.row, error: "Producto no encontrado." });
					continue;
				}

				let imagen: Awaited<ReturnType<typeof resolveProductoImagenFromUrl>>;
				try {
					imagen = await resolveProductoImagenFromUrl(
						entry.data.imagen,
						row.imagen,
						opts.origin,
						nombre,
					);
				} catch (err) {
					failed.push({
						row: row.row,
						error: err instanceof Error ? err.message : "Error de imagen",
					});
					continue;
				}

				const data: ProductoUpdateData = {
					nombre,
					precio: precioInt,
					descripcion: row.descripcion.trim() || null,
					categoria: categoriaId,
				};
				if (imagen !== undefined) data.imagen = imagen;

				await updateProductoViaApi(entry.data.id, data, opts.restaurantId, {
					skipCacheBust: true,
				});
				updated += 1;
				wrote = true;
			} else {
				let imagen: Awaited<ReturnType<typeof resolveProductoImagenFromUrl>>;
				try {
					imagen = await resolveProductoImagenFromUrl(
						null,
						row.imagen,
						opts.origin,
						nombre,
					);
				} catch (err) {
					failed.push({
						row: row.row,
						error: err instanceof Error ? err.message : "Error de imagen",
					});
					continue;
				}

				await createProductoViaApi(
					{
						nombre,
						precio: precioInt,
						descripcion: row.descripcion.trim() || null,
						restauranteId: opts.restaurantId,
						categoriaId,
						...(imagen !== undefined ? { imagen } : {}),
					},
					{ skipCacheBust: true },
				);
				created += 1;
				wrote = true;
			}
		} catch (err) {
			failed.push({
				row: row.row,
				error: err instanceof Error ? err.message : "Error al guardar",
			});
		}
	}

	if (wrote) {
		await bustOwnerListCache(opts.restaurantId, "both");
	}

	return Response.json({
		ok: failed.length === 0,
		created,
		updated,
		categoriasCreated: catResult.categoriasCreated,
		failed,
	});
}
