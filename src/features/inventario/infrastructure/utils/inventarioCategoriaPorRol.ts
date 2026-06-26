/**
 * Devuelve la categoría de inventario que corresponde al rol del usuario.
 * Impresión y Taller solo ven su propio inventario; admin y otros pueden filtrar libremente.
 */
export function getInventarioCategoriaPorRol(rol?: string | null): string | undefined {
  const r = (rol || '').toLowerCase();
  if (r === 'impresión' || r === 'impresion') return 'Impresión';
  if (r === 'taller') return 'Taller';
  return undefined;
}

export function resolveInventarioCategoria(
  rol: string | undefined | null,
  queryCategoria?: string
): string | undefined {
  const locked = getInventarioCategoriaPorRol(rol);
  if (locked) return locked;
  return queryCategoria || undefined;
}
