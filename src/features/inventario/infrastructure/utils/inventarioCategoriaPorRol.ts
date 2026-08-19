/**
 * Devuelve la categoría de inventario si corresponde a un filtro específico.
 * En la estructura simplificada (Admin / Trabajador), el inventario es unificado.
 */
export function getInventarioCategoriaPorRol(_rol?: string | null): string | undefined {
  return undefined;
}

export function resolveInventarioCategoria(
  _rol: string | undefined | null,
  queryCategoria?: string
): string | undefined {
  return queryCategoria || undefined;
}

