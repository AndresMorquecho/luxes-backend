import ExcelJS from 'exceljs';

export const CATEGORIAS_VALIDAS = ['Taller', 'Oficina', 'Impresión'] as const;
export type CategoriaInventario = (typeof CATEGORIAS_VALIDAS)[number];

export const SUBTIPOS_POR_CATEGORIA: Record<CategoriaInventario, Array<{ id: string; label: string }>> = {
  Taller: [
    { id: 'herramienta', label: 'Herramienta / Equipo' },
    { id: 'consumible_registro', label: 'Consumible (solo registro)' },
  ],
  Oficina: [
    { id: 'activo_fijo', label: 'Activo fijo' },
  ],
  Impresión: [
    { id: 'consumible_descargable', label: 'Material descargable (rollos/lonas)' },
    { id: 'consumible_registro', label: 'Material no rastreable (tintas)' },
  ],
};

const SUBTIPO_DEFAULTS: Record<string, { descargaStock: boolean; esPrestable: boolean; tipo: string }> = {
  herramienta: { descargaStock: false, esPrestable: true, tipo: 'herramienta' },
  consumible_descargable: { descargaStock: true, esPrestable: false, tipo: 'consumible' },
  consumible_registro: { descargaStock: false, esPrestable: false, tipo: 'consumible' },
  activo_fijo: { descargaStock: false, esPrestable: false, tipo: 'consumible' },
};

const COLUMN_HEADERS = [
  'subtipo', 'nombre', 'cantidad', 'unidad', 'precio_costo', 'stock_minimo',
  'codigo', 'marca', 'modelo', 'serie', 'estado_uso', 'responsable',
];

const EXAMPLE_ROWS: Record<CategoriaInventario, unknown[][]> = {
  Taller: [
    ['Herramienta / Equipo', 'Taladro percutor 18V', 1, 'unidades', 85, '', 'HER-001', 'Bosch', 'GSB 18V', '', 'BODEGA', ''],
    ['Consumible (solo registro)', 'Tornillos autoperforantes', 500, 'unidades', 12.5, '', '', '', '', '', '', ''],
  ],
  Oficina: [
    ['Activo fijo', 'Silla ergonómica giratoria', 4, 'unidades', 120, '', 'OFI-001', 'ErgoMax', 'Pro 300', '', 'BODEGA', ''],
    ['Activo fijo', 'Monitor 27" IPS', 2, 'unidades', 280, '', 'OFI-002', 'LG', '27UP850', 'SN-998877', 'EN USO', 'Administración'],
  ],
  Impresión: [
    ['Material descargable (rollos/lonas)', 'Rollo Vinil Mate 1.2m', 50, 'metros', 2.5, 10, '', '', '', '', '', ''],
    ['Material no rastreable (tintas)', 'Tinta Cyan 1 litro', 5, 'litro', 45, '', '', '', '', '', '', ''],
  ],
};

const INSTRUCTIONS: Record<CategoriaInventario, string[][]> = {
  Taller: [
    ['Plantilla de importación — Taller'],
    [''],
    ['Columnas obligatorias: subtipo, nombre, cantidad, unidad'],
    ['Valores válidos para "subtipo": Herramienta / Equipo | Consumible (solo registro)'],
    ['estado_uso: BODEGA | EN USO | NO SIRVE | EN REPARACION'],
  ],
  Oficina: [
    ['Plantilla de importación — Oficina'],
    [''],
    ['Columnas obligatorias: subtipo, nombre, cantidad, unidad'],
    ['Valores válidos para "subtipo": Activo fijo'],
    ['estado_uso: BODEGA | EN USO | NO SIRVE | EN REPARACION'],
  ],
  Impresión: [
    ['Plantilla de importación — Impresión'],
    [''],
    ['Columnas obligatorias: subtipo, nombre, cantidad, unidad'],
    ['Valores válidos: Material descargable (rollos/lonas) | Material no rastreable (tintas)'],
    ['stock_minimo aplica solo a materiales descargables'],
  ],
};

const ESTADOS_USO_VALIDOS = new Set(['BODEGA', 'EN USO', 'NO SIRVE', 'EN REPARACION']);

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildSubtipoLookup(categoria: CategoriaInventario): Map<string, string> {
  const map = new Map<string, string>();
  for (const { id, label } of SUBTIPOS_POR_CATEGORIA[categoria] || []) {
    map.set(normalizeKey(id), id);
    map.set(normalizeKey(label), id);
  }
  return map;
}

export function isCategoriaValida(categoria: string): categoria is CategoriaInventario {
  return (CATEGORIAS_VALIDAS as readonly string[]).includes(categoria);
}

export function resolveSubtipoId(categoria: CategoriaInventario, raw: string): string | null {
  return buildSubtipoLookup(categoria).get(normalizeKey(raw)) ?? null;
}

export interface UnidadMedidaRef {
  id: string;
  nombre: string;
  abreviacion?: string | null;
}

export function findUnidad(unidades: UnidadMedidaRef[], raw: string): UnidadMedidaRef | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  return unidades.find(u =>
    normalizeKey(u.nombre) === key ||
    normalizeKey(u.abreviacion) === key ||
    normalizeKey(`${u.nombre} (${u.abreviacion})`) === key
  ) ?? null;
}

export interface ImportRowPayload {
  nombre: string;
  tipo: string;
  subtipo: string;
  descargaStock: boolean;
  esPrestable: boolean;
  categoria: string;
  stockActual: number;
  stockMinimo: number;
  precioCosto: number;
  unidadMedidaId: string;
  unidadMedida: string;
  codigo?: string;
  marca?: string;
  modelo?: string;
  serie?: string;
  estadoUso?: string;
  aCargo?: string;
}

export interface ParsedImportRow {
  line: number;
  nombre: string;
  payload: ImportRowPayload;
}

export interface ParseImportError {
  line: number;
  nombre: string;
  messages: string[];
}

export function validateImportItem(
  raw: Record<string, unknown>,
  line: number,
  categoria: CategoriaInventario,
  unidades: UnidadMedidaRef[],
): { ok: true; row: ParsedImportRow } | { ok: false; error: ParseImportError } {
  const nombre = String(raw.nombre ?? '').trim();
  const subtipoRaw = String(raw.subtipo ?? '').trim();
  const messages: string[] = [];

  if (!nombre) messages.push('nombre es obligatorio');
  if (!subtipoRaw) messages.push('subtipo es obligatorio');

  const subtipoId = subtipoRaw ? resolveSubtipoId(categoria, subtipoRaw) : null;
  if (subtipoRaw && !subtipoId) {
    const valid = SUBTIPOS_POR_CATEGORIA[categoria].map(s => s.label).join(' | ');
    messages.push(`subtipo inválido. Use: ${valid}`);
  }

  const unidadMedidaIdRaw = String(raw.unidadMedidaId ?? '').trim();
  let unidad: UnidadMedidaRef | null = null;

  if (unidadMedidaIdRaw) {
    unidad = unidades.find(u => u.id === unidadMedidaIdRaw) ?? null;
    if (!unidad) messages.push('unidad de medida no encontrada en el sistema');
  } else {
    const unidadRaw = String(raw.unidad ?? raw.unidadMedida ?? '').trim();
    unidad = findUnidad(unidades, unidadRaw);
    if (!unidadRaw) messages.push('unidad es obligatoria');
    else if (!unidad) messages.push(`unidad "${unidadRaw}" no encontrada en el sistema`);
  }

  const cantidad = Number(raw.cantidad ?? raw.stockActual ?? 0);
  if (Number.isNaN(cantidad) || cantidad < 0) messages.push('cantidad debe ser un número ≥ 0');

  const precioCosto = Number(raw.precio_costo ?? raw.precioCosto ?? 0);
  if (Number.isNaN(precioCosto) || precioCosto < 0) messages.push('precio_costo debe ser un número ≥ 0');

  if (messages.length || !subtipoId || !unidad) {
    return {
      ok: false,
      error: { line, nombre: nombre || '(sin nombre)', messages },
    };
  }

  const defaults = SUBTIPO_DEFAULTS[subtipoId];
  const stockMinimo = Number(raw.stock_minimo ?? raw.stockMinimo ?? 0);
  const showExtraFields = subtipoId === 'herramienta' || subtipoId === 'activo_fijo';

  const payload: ImportRowPayload = {
    nombre,
    tipo: defaults.tipo,
    subtipo: subtipoId,
    descargaStock: defaults.descargaStock,
    esPrestable: defaults.esPrestable,
    categoria,
    stockActual: cantidad,
    stockMinimo: defaults.descargaStock ? (Number.isNaN(stockMinimo) ? 0 : stockMinimo) : 0,
    precioCosto: Number.isNaN(precioCosto) ? 0 : precioCosto,
    unidadMedidaId: unidad.id,
    unidadMedida: unidad.nombre,
  };

  if (showExtraFields) {
    const codigo = String(raw.codigo ?? '').trim();
    const marca = String(raw.marca ?? '').trim();
    const modelo = String(raw.modelo ?? '').trim();
    const serie = String(raw.serie ?? '').trim();
    const estadoUso = (String(raw.estado_uso ?? raw.estadoUso ?? 'BODEGA').trim().toUpperCase() || 'BODEGA');
    const aCargo = String(raw.responsable ?? raw.aCargo ?? '').trim();

    if (codigo) payload.codigo = codigo;
    if (marca) payload.marca = marca;
    if (modelo) payload.modelo = modelo;
    if (serie) payload.serie = serie;
    if (ESTADOS_USO_VALIDOS.has(estadoUso)) {
      payload.estadoUso = estadoUso;
    } else {
      payload.estadoUso = 'BODEGA';
    }
    if (aCargo && payload.estadoUso !== 'BODEGA') payload.aCargo = aCargo;
  }

  return { ok: true, row: { line, nombre, payload } };
}

function cellValue(cell: ExcelJS.Cell): string | number {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'result' in v) return Number(v.result) || String(v.result ?? '');
  if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text);
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'number' ? v : String(v);
}

/** Parsea buffer Excel en el servidor */
export async function parseImportExcelBuffer(
  buffer: Buffer | ArrayBuffer,
  categoria: CategoriaInventario,
  unidades: UnidadMedidaRef[],
): Promise<{ rows: ParsedImportRow[]; errors: ParseImportError[] }> {
  const workbook = new ExcelJS.Workbook();
  const bytes = buffer instanceof Buffer
    ? buffer
    : Buffer.from(new Uint8Array(buffer as ArrayBuffer));
  // ExcelJS tipos vs Node Buffer — cast seguro en runtime
  await workbook.xlsx.load(bytes as any);

  const sheet = workbook.getWorksheet('Productos') ?? workbook.worksheets[0];
  if (!sheet) {
    throw new Error('El archivo Excel no contiene hojas válidas.');
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = normalizeKey(cellValue(cell));
  });

  const hasHeader = headers.includes('subtipo') && headers.includes('nombre');
  const dataStart = hasHeader ? 2 : 1;
  const effectiveHeaders = hasHeader ? headers : COLUMN_HEADERS.map(normalizeKey);

  const rows: ParsedImportRow[] = [];
  const errors: ParseImportError[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < dataStart) return;

    const raw: Record<string, unknown> = {};
    effectiveHeaders.forEach((key, idx) => {
      if (key) raw[key] = cellValue(row.getCell(idx + 1));
    });

    const nombre = String(raw.nombre ?? '').trim();
    const subtipo = String(raw.subtipo ?? '').trim();
    if (!nombre && !subtipo) return;

    const result = validateImportItem(raw, rowNumber, categoria, unidades);
    if (result.ok) rows.push(result.row);
    else errors.push(result.error);
  });

  return { rows, errors };
}

/** Genera plantilla Excel en memoria */
export async function buildImportTemplateBuffer(categoria: CategoriaInventario): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const ws = workbook.addWorksheet('Productos');
  ws.columns = COLUMN_HEADERS.map(h => ({
    header: h,
    key: h,
    width: h === 'subtipo' || h === 'nombre' ? 34 : 14,
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFF6FF' },
  };

  for (const example of EXAMPLE_ROWS[categoria] || []) {
    const rowData: Record<string, unknown> = {};
    COLUMN_HEADERS.forEach((col, i) => { rowData[col] = example[i] ?? ''; });
    ws.addRow(rowData);
  }

  const wsInst = workbook.addWorksheet('Instrucciones');
  for (const line of INSTRUCTIONS[categoria] || []) {
    wsInst.addRow(line);
  }
  wsInst.getColumn(1).width = 72;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function templateFilename(categoria: CategoriaInventario): string {
  const slug = categoria.toLowerCase().replace(/[^a-z0-9]+/gi, '_');
  return `plantilla_inventario_${slug}.xlsx`;
}
