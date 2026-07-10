import { env } from '../../../../config/env.js';

// ── Tipos de dominio ──────────────────────────────────────────────────────────

export interface DetAdicionalInput {
  nombre: string;
  valor: string;
}

export interface DetalleGuiaInput {
  codigoInterno?: string;
  codigoAdicional?: string;
  descripcion: string;
  cantidad: number;
  detallesAdicionales?: DetAdicionalInput[];
}

export interface DestinatarioInput {
  identificacionDestinatario: string;
  razonSocialDestinatario: string;
  dirDestinatario: string;
  motivoTraslado: string;
  docAduaneroUnico?: string;
  codEstabDestino?: string;
  ruta?: string;
  codDocSustento?: string;
  numDocSustento?: string;
  numAutDocSustento?: string;
  fechaEmisionDocSustento?: string; // dd/mm/yyyy
  detalles: DetalleGuiaInput[];
}

export interface EmitirGuiaInput {
  // Datos del transportista
  dirEstablecimiento?: string;
  dirPartida: string;
  razonSocialTransportista: string;
  tipoIdentificacionTransportista: string;
  rucTransportista: string;
  rise?: string;
  obligadoContabilidad?: 'SI' | 'NO';
  contribuyenteEspecial?: string;
  fechaIniTransporte: string; // dd/mm/yyyy
  fechaFinTransporte: string; // dd/mm/yyyy
  placa: string;
  destinatarios: DestinatarioInput[];
  // Opcionales
  emailReceiver?: string;
  callbackUrl?: string;
  referencia?: string;
  // Sobreescritura de info tributaria (opcional — usa los del RUC configurado si se omite)
  estab?: string;
  ptoEmi?: string;
}

export interface SriComprobanteResponse {
  id: string;
  estado: string;
  tipo: string;
  es_prueba: boolean;
  clave_acceso: string | null;
  mensaje: string;
}

export interface ConsultaEstadoResponse {
  id: string;
  estado: string;
  clave_acceso: string | null;
  mensaje: string;
  tipo: string;
}

// ── Servicio ──────────────────────────────────────────────────────────────────

export class GuiaRemisionService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly ambiente: string;

  constructor() {
    this.baseUrl = env.sriApiUrl;
    this.apiKey  = env.sriApiKey;
    this.ambiente = env.sriAmbiente;
  }

  /** Emite una guía de remisión electrónica ante el SRI vía CipherByte */
  async emitirGuia(input: EmitirGuiaInput): Promise<SriComprobanteResponse> {
    if (!this.apiKey) {
      throw new Error('SRI_API_KEY no configurada. Agrega la variable de entorno en el .env del backend.');
    }

    const body = this.buildPayload(input);
    const url  = `${this.baseUrl}/api/comprobantes/guia_remision`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Error al parsear respuesta de la API SRI (HTTP ${res.status})`);
    }

    if (!res.ok) {
      const msg = json?.detail || json?.message || json?.mensaje || `HTTP ${res.status}`;
      throw new Error(`Error SRI API: ${msg}`);
    }

    return json as SriComprobanteResponse;
  }

  /** Consulta el estado de un comprobante ya emitido por su ID */
  async consultarEstado(comprobanteId: string): Promise<ConsultaEstadoResponse> {
    if (!this.apiKey) {
      throw new Error('SRI_API_KEY no configurada.');
    }

    const url = `${this.baseUrl}/api/comprobantes/${comprobanteId}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Error al parsear respuesta de consulta SRI (HTTP ${res.status})`);
    }

    if (!res.ok) {
      const msg = json?.detail || json?.message || json?.mensaje || `HTTP ${res.status}`;
      throw new Error(`Error al consultar estado SRI: ${msg}`);
    }

    return json as ConsultaEstadoResponse;
  }

  // ── Construcción del payload ──────────────────────────────────────────────

  private buildPayload(input: EmitirGuiaInput) {
    const destinatarios = input.destinatarios.map((dest) => ({
      identificacion_destinatario: dest.identificacionDestinatario,
      razon_social_destinatario:   dest.razonSocialDestinatario,
      dir_destinatario:            dest.dirDestinatario,
      motivo_traslado:             dest.motivoTraslado,
      doc_aduanero_unico:          dest.docAduaneroUnico || '',
      cod_estab_destino:           dest.codEstabDestino  || '',
      ruta:                        dest.ruta             || '',
      cod_doc_sustento:            dest.codDocSustento   || '01',
      num_doc_sustento:            dest.numDocSustento   || '',
      num_aut_doc_sustento:        dest.numAutDocSustento || '',
      fecha_emision_doc_sustento:  dest.fechaEmisionDocSustento || this.todayEcuador(),
      detalles: {
        detalle: dest.detalles.map((d) => ({
          codigo_interno:    d.codigoInterno    || '',
          codigo_adicional:  d.codigoAdicional  || '',
          descripcion:       d.descripcion,
          cantidad:          d.cantidad,
          ...(d.detallesAdicionales?.length
            ? {
                detalles_adicionales: {
                  det_adicional: d.detallesAdicionales.map((da) => ({
                    nombre: da.nombre,
                    value:  da.valor,
                  })),
                },
              }
            : {}),
        })),
      },
    }));

    return {
      comprobante: {
        info_guia_remision: {
          dir_establecimiento:              input.dirEstablecimiento || '',
          dir_partida:                      input.dirPartida,
          razon_social_transportista:       input.razonSocialTransportista,
          tipo_identificacion_transportista: input.tipoIdentificacionTransportista,
          ruc_transportista:                input.rucTransportista,
          rise:                             input.rise || '',
          obligado_contabilidad:            input.obligadoContabilidad || 'NO',
          contribuyente_especial:           input.contribuyenteEspecial || '',
          fecha_ini_transporte:             input.fechaIniTransporte,
          fecha_fin_transporte:             input.fechaFinTransporte,
          placa:                            input.placa,
        },
        destinatarios: { destinatario: destinatarios },
        id:      'comprobante',
        version: '1.0.0',
      },
      email_receiver: input.emailReceiver || '',
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      ...(input.referencia  ? { referencia: input.referencia }    : {}),
    };
  }

  /** Fecha de hoy en formato dd/mm/yyyy (zona Ecuador) */
  private todayEcuador(): string {
    const now = new Date();
    const d   = now.getDate().toString().padStart(2, '0');
    const m   = (now.getMonth() + 1).toString().padStart(2, '0');
    const y   = now.getFullYear();
    return `${d}/${m}/${y}`;
  }
}
