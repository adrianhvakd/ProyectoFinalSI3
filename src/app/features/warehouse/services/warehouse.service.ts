import { Injectable, inject } from '@angular/core';
import {
  ControlCalidad,
  EstadoLote,
  Lote,
  ReporteLoteRow,
  RpcEjecutarControlCalidadParams,
  RpcResolverLoteObservadoParams,
} from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';

export interface ReceiveLotPayload {
  codigo_unico: string;
  id_materia_prima: string;
  id_proveedor: string;
  cantidad_recibida: number;
  fecha_recepcion: string;
  fecha_vencimiento: string;
}

const SELECT_LOTE =
  'id_lote, codigo_unico, id_materia_prima, id_proveedor, cantidad_recibida, cantidad_disponible, fecha_recepcion, fecha_vencimiento, estado, materia_prima(id_materia_prima, codigo, nombre, unidad_medida, precio_mayorista, cantidad_minima_venta, parametros_calidad_exigidos, stock_disponible_total), proveedor(id_proveedor, identificacion_fiscal, razon_social, pais_origen, datos_contacto, activo), control_calidad(id_control, id_lote, id_usuario, cumple_parametros, informe_tecnico_hallazgos, resolucion_secundaria, fecha_evaluacion, usuario(id_usuario, nombre_completo))';

const SELECT_REPORTE_LOTES =
  'id_lote, codigo_unico, materia_prima, codigo_materia_prima, unidad_medida, proveedor, pais_origen, cantidad_recibida, cantidad_disponible, fecha_recepcion, fecha_vencimiento, estado, cumple_parametros, informe_tecnico_hallazgos, resolucion_secundaria, fecha_evaluacion';

@Injectable({
  providedIn: 'root',
})
export class WarehouseService {
  private readonly supabase = inject(SupabaseService);

  async receiveLot(payload: ReceiveLotPayload): Promise<Lote> {
    const { data, error } = await this.supabase.client
      .from('lote')
      .insert({
        codigo_unico: payload.codigo_unico,
        id_materia_prima: payload.id_materia_prima,
        id_proveedor: payload.id_proveedor,
        cantidad_recibida: payload.cantidad_recibida,
        cantidad_disponible: payload.cantidad_recibida,
        fecha_recepcion: payload.fecha_recepcion,
        fecha_vencimiento: payload.fecha_vencimiento,
        estado: 'En revisión',
      })
      .select(SELECT_LOTE)
      .single();

    if (error || !data) {
      throw new Error(translateSupabaseError(error, 'No se pudo registrar la recepción del lote.'));
    }

    return data as unknown as Lote;
  }

  async getLots(estado?: EstadoLote): Promise<Lote[]> {
    let query = this.supabase.client
      .from('lote')
      .select(SELECT_LOTE)
      .order('fecha_recepcion', { ascending: false });

    if (estado) {
      query = query.eq('estado', estado);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo consultar el inventario de lotes.'));
    }

    const lots = (data ?? []) as unknown as Lote[];
    return lots.map((lote) => ({
      ...lote,
      control_calidad: this.sortQualityHistory(lote.control_calidad),
    }));
  }

  async executeQualityControl(params: RpcEjecutarControlCalidadParams): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('rpc_ejecutar_control_calidad', params);
    if (error) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo registrar el control de calidad del lote.'),
      );
    }
    return String(data ?? '');
  }

  async resolveObservedLot(params: RpcResolverLoteObservadoParams): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('rpc_resolver_lote_observado', params);
    if (error) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo resolver la observación del lote.'),
      );
    }
    return String(data ?? '');
  }

  async getReportLots(): Promise<ReporteLoteRow[]> {
    const { data, error } = await this.supabase.client
      .from('vw_reporte_lotes')
      .select(SELECT_REPORTE_LOTES)
      .order('fecha_recepcion', { ascending: false });

    if (error) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo consultar la vista de reporte de lotes.'),
      );
    }

    return (data ?? []) as ReporteLoteRow[];
  }

  private sortQualityHistory(items: ControlCalidad[] | null | undefined): ControlCalidad[] {
    if (!items || items.length === 0) {
      return [];
    }
    return [...items].sort(
      (a, b) => new Date(b.fecha_evaluacion).getTime() - new Date(a.fecha_evaluacion).getTime(),
    );
  }
}
