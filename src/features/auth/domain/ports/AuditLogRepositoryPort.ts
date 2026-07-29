/**
 * Puerto de persistencia para el historial de auditoría.
 */
export interface AuditLogPaginatedResult {
  data: any[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export abstract class AuditLogRepositoryPort {
  abstract create(log: {
    userId?: string;
    usuarioNom?: string;
    accion: string;
    modulo: string;
    detalle: string;
    severidad: string;
  }): Promise<any>;

  abstract findAll(filters?: {
    search?: string;
    userId?: string;
    modulo?: string;
    severidad?: string;
    page?: number;
    limit?: number;
  }): Promise<AuditLogPaginatedResult>;
}
