export type RecepcionInput = { fechaRecepcion?: string; notasRecepcion?: string; detalles: {
  detalleId?: string; materialId?: string | null; cantidad: number; descargableInventario?: boolean;
  fechaRecepcion?: string; rollos?: number[];
}[] };
export type AnulacionInput = {
  version: string; motivo: string; confirmarNumero: string; deuda: 'conservar' | 'cancelar';
  reembolso: { monto: number; metodoPagoId?: string }; devoluciones: { materialId: string; cantidad: number }[];
  aceptarSinTrazabilidad?: boolean;
};
export interface AnulacionPreview {
  id: string; numero: string; estado: string; proveedor: string; total: number; pagado: number; saldo: number;
  pagos: { id: string; monto: number; cuenta: string }[];
  chequesPendientes: { id: string; numero: string; monto: number }[];
  materiales: { materialId: string; nombre: string; codigo: string | null; unidad: string; recibido: number; disponible: number; maxDevolver: number }[];
  sinTrazabilidad: boolean; anulacion: Record<string, any> | null; version: string;
}
