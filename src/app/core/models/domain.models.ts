export type RolUsuario =
  | 'Administrador'
  | 'Encargado de Almacén'
  | 'Encargado de Ventas y Caja'
  | 'Encargado de Despacho'
  | 'Camionero'
  | 'Empresa Cliente';

export type EstadoLote = 'En revisión' | 'Aprobado / Disponible' | 'Observado' | 'Devuelto';

export type EstadoPedido = 'Pendiente' | 'Aprobado / Recibido' | 'Rechazado';

export type ModalidadEntrega = 'Recojo en el local' | 'Envío a dirección en camión';

export type EstadoEntrega = 'Pendiente (a que el camión lo recoja)' | 'Enviado' | 'Entregado';

export type MetodoPago = 'QR' | 'Efectivo';

export type EstadoPago = 'Pendiente' | 'Pendiente de verificación' | 'Aprobado' | 'Rechazado';

export interface ParametroCalidad {
  key: string;
  label: string;
  requerido: boolean;
}

export const UNIDADES_MEDIDA_INDUSTRIALES = [
  'Kilogramo (kg)',
  'Tonelada (t)',
  'Quintal (qq)',
  'Litro (L)',
  'Saco',
  'Bolsa',
  'Caja',
  'Tambor',
  'Metro (m)',
  'Unidad',
] as const;

export const STANDARD_QUALITY_PARAMETERS: readonly ParametroCalidad[] = [
  { key: 'integridad_empaque', label: 'Integridad del empaque', requerido: true },
  { key: 'humedad_rango', label: 'Humedad dentro de rango', requerido: true },
  { key: 'pureza_certificada', label: 'Pureza / Concentración certificada', requerido: true },
  { key: 'ausencia_contaminacion', label: 'Ausencia de contaminación física', requerido: true },
  { key: 'etiquetado_trazabilidad', label: 'Etiquetado y trazabilidad de origen', requerido: true },
  { key: 'temperatura_conservacion', label: 'Temperatura de conservación', requerido: false },
  { key: 'certificado_analisis', label: 'Certificado de análisis del proveedor', requerido: false },
] as const;

export interface Usuario {
  id_usuario: string;
  email: string;
  nombre_completo: string;
  rol: RolUsuario;
  activo: boolean;
}

export interface EmpresaCliente {
  id_empresa_cliente: string;
  id_usuario: string;
  nit: string;
  razon_social: string;
  telefono: string;
  direccion: string;
}

export interface Camion {
  id_camion: string;
  id_usuario: string;
  placa: string;
  capacidad_kg: number;
  disponible: boolean;
}

export interface UsuarioConRelaciones extends Usuario {
  empresa_cliente?: EmpresaCliente | EmpresaCliente[] | null;
  camion?: Camion | Camion[] | null;
}

export interface EmpresaClienteConUsuario extends EmpresaCliente {
  usuario?: Usuario | Usuario[] | null;
}

export interface Proveedor {
  id_proveedor: string;
  identificacion_fiscal: string;
  razon_social: string;
  pais_origen: string;
  datos_contacto: string;
  activo: boolean;
}

export interface MateriaPrima {
  id_materia_prima: string;
  codigo: string;
  nombre: string;
  unidad_medida: string;
  precio_mayorista: number;
  cantidad_minima_venta: number;
  parametros_calidad_exigidos: ParametroCalidad[];
  stock_disponible_total: number;
}

export interface ControlCalidad {
  id_control: string;
  id_lote: string;
  id_usuario: string;
  cumple_parametros: boolean;
  informe_tecnico_hallazgos: string | null;
  resolucion_secundaria: string | null;
  fecha_evaluacion: string;
  usuario?:
    | Pick<Usuario, 'id_usuario' | 'nombre_completo'>
    | Pick<Usuario, 'id_usuario' | 'nombre_completo'>[]
    | null;
}

export interface Lote {
  id_lote: string;
  codigo_unico: string;
  id_materia_prima: string;
  id_proveedor: string;
  cantidad_recibida: number;
  cantidad_disponible: number;
  fecha_recepcion: string;
  fecha_vencimiento: string;
  estado: EstadoLote;
  materia_prima?: MateriaPrima | MateriaPrima[] | null;
  proveedor?: Proveedor | Proveedor[] | null;
  control_calidad?: ControlCalidad[] | null;
}

export interface DetallePedido {
  id_detalle: string;
  numero_pedido: number;
  id_materia_prima: string;
  id_lote: string;
  cantidad_solicitada: number;
  precio_unitario_mayorista: number;
  subtotal: number;
  materia_prima?:
    | Pick<MateriaPrima, 'id_materia_prima' | 'codigo' | 'nombre' | 'unidad_medida'>
    | Pick<MateriaPrima, 'id_materia_prima' | 'codigo' | 'nombre' | 'unidad_medida'>[]
    | null;
  lote?: Pick<Lote, 'id_lote' | 'codigo_unico'> | Pick<Lote, 'id_lote' | 'codigo_unico'>[] | null;
}

export interface Pago {
  id_pago: string;
  numero_pedido: number;
  metodo: MetodoPago;
  monto: number;
  url_comprobante_qr: string | null;
  estado: EstadoPago;
  motivo_observacion: string | null;
  fecha_registro: string;
  fecha_verificacion: string | null;
  pedido?: PedidoConEmpresa | PedidoConEmpresa[] | null;
}

export interface Pedido {
  numero_pedido: number;
  id_empresa_cliente: string;
  modalidad_entrega: ModalidadEntrega;
  direccion_destino: string | null;
  latitud: number | null;
  longitud: number | null;
  celular_contacto: string | null;
  subtotal_mayorista: number;
  estado_pedido: EstadoPedido;
  estado_entrega: EstadoEntrega;
  fecha_creacion: string;
  empresa_cliente?: EmpresaCliente | EmpresaCliente[] | null;
  detalle_pedido?: DetallePedido[] | null;
  pago?: Pago | Pago[] | null;
}

export interface PedidoConEmpresa extends Omit<
  Pedido,
  'detalle_pedido' | 'pago' | 'empresa_cliente'
> {
  empresa_cliente?:
    | Pick<EmpresaCliente, 'id_empresa_cliente' | 'nit' | 'razon_social' | 'telefono'>
    | Pick<EmpresaCliente, 'id_empresa_cliente' | 'nit' | 'razon_social' | 'telefono'>[]
    | null;
}

export interface ReporteLoteRow {
  id_lote: string;
  codigo_unico: string;
  materia_prima: string;
  codigo_materia_prima: string;
  unidad_medida: string;
  proveedor: string;
  pais_origen: string;
  cantidad_recibida: number;
  cantidad_disponible: number;
  fecha_recepcion: string;
  fecha_vencimiento: string;
  estado: EstadoLote;
  cumple_parametros: boolean | null;
  informe_tecnico_hallazgos: string | null;
  resolucion_secundaria: string | null;
  fecha_evaluacion: string | null;
}

export interface ReporteVentasPagosRow {
  id_pago: string;
  numero_pedido: number;
  empresa_cliente: string;
  nit_cliente: string;
  metodo_pago: MetodoPago;
  subtotal_mayorista: number;
  estado_pago: EstadoPago;
  estado_pedido: EstadoPedido;
  estado_entrega: EstadoEntrega;
  modalidad_entrega: ModalidadEntrega;
  direccion_destino: string | null;
  latitud: number | null;
  longitud: number | null;
  celular_contacto: string | null;
  url_comprobante_qr: string | null;
  motivo_observacion: string | null;
  fecha_pago: string;
  fecha_creacion: string;
  fecha_verificacion: string | null;
}

export interface RpcEjecutarControlCalidadParams {
  p_id_lote: string;
  p_id_usuario: string;
  p_cumple_parametros: boolean;
  p_informe_tecnico: string | null;
}

export interface RpcResolverLoteObservadoParams {
  p_id_lote: string;
  p_id_usuario: string;
  p_aprobado: boolean;
  p_resolucion_secundaria: string;
}

export interface RpcPedidoItemParam {
  id_lote: string;
  cantidad: number;
}

export interface RpcCrearPedidoConPagoParams {
  p_id_empresa_cliente: string;
  p_modalidad_entrega: ModalidadEntrega;
  p_direccion_destino: string | null;
  p_metodo_pago: MetodoPago;
  p_url_comprobante_qr: string | null;
  p_items: RpcPedidoItemParam[];
  p_latitud: number | null;
  p_longitud: number | null;
  p_celular_contacto: string | null;
}

export interface RpcVerificarPagoParams {
  p_id_pago: string;
  p_aprobado: boolean;
  p_motivo_observacion: string | null;
}

export interface RpcReenviarComprobanteQrParams {
  p_id_pago: string;
  p_nueva_url_comprobante: string;
}

export const ROLES_USUARIO: readonly RolUsuario[] = [
  'Administrador',
  'Encargado de Almacén',
  'Encargado de Ventas y Caja',
  'Encargado de Despacho',
  'Camionero',
  'Empresa Cliente',
] as const;

export const ROLES_INTERNOS: readonly RolUsuario[] = [
  'Administrador',
  'Encargado de Almacén',
  'Encargado de Ventas y Caja',
  'Encargado de Despacho',
  'Camionero',
] as const;

export const ESTADOS_LOTE: readonly EstadoLote[] = [
  'En revisión',
  'Aprobado / Disponible',
  'Observado',
  'Devuelto',
] as const;

export const ESTADOS_PAGO: readonly EstadoPago[] = [
  'Pendiente',
  'Pendiente de verificación',
  'Aprobado',
  'Rechazado',
] as const;

export const ESTADOS_PEDIDO: readonly EstadoPedido[] = [
  'Pendiente',
  'Aprobado / Recibido',
  'Rechazado',
] as const;

export function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toParameterKey(label: string, index: number): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `parametro_${index + 1}`;
}

export function normalizeQualityParameters(raw: unknown): ParametroCalidad[] {
  if (!raw) {
    return [];
  }

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = trimmed;
      }
    }
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map((entry, idx): ParametroCalidad | null => {
        if (typeof entry === 'string') {
          const label = entry.trim();
          return label ? { key: toParameterKey(label, idx), label, requerido: true } : null;
        }
        if (typeof entry === 'object' && entry !== null) {
          const record = entry as Record<string, unknown>;
          const label = String(record['label'] ?? record['key'] ?? '').trim();
          if (!label) {
            return null;
          }
          const rawKey = String(record['key'] ?? '').trim();
          return {
            key: rawKey || toParameterKey(label, idx),
            label,
            requerido: Boolean(record['requerido']),
          };
        }
        return null;
      })
      .filter((item): item is ParametroCalidad => item !== null);
  }

  if (typeof parsed === 'string') {
    const separator = parsed.includes('\n') || parsed.includes(';') ? /[\n;]+/ : /[,]+/;
    return parsed
      .split(separator)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((label, idx) => ({
        key: toParameterKey(label, idx),
        label,
        requerido: true,
      }));
  }

  return [];
}

export function formatActiveQualityParameters(raw: unknown): string {
  const active = normalizeQualityParameters(raw)
    .filter((p) => p.requerido)
    .map((p) => p.label);
  return active.length > 0 ? active.join(' · ') : 'Sin parámetros activos';
}
