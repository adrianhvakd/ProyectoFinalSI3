import { Injectable, inject } from '@angular/core';
import {
  Pago,
  ReporteVentasPagosRow,
  RpcVerificarPagoParams,
} from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';

const SELECT_PAGOS =
  'id_pago, numero_pedido, metodo, monto, url_comprobante_qr, estado, motivo_observacion, fecha_registro, fecha_verificacion, pedido(numero_pedido, id_empresa_cliente, modalidad_entrega, direccion_destino, subtotal_mayorista, estado_pedido, estado_entrega, fecha_creacion, empresa_cliente(id_empresa_cliente, nit, razon_social, telefono))';

const SELECT_REPORTE_VENTAS =
  'id_pago, numero_pedido, empresa_cliente, nit_cliente, metodo_pago, subtotal_mayorista, estado_pago, estado_pedido, estado_entrega, modalidad_entrega, direccion_destino, url_comprobante_qr, motivo_observacion, fecha_pago, fecha_creacion, fecha_verificacion';

@Injectable({
  providedIn: 'root',
})
export class SalesService {
  private readonly supabase = inject(SupabaseService);

  async getPayments(): Promise<Pago[]> {
    const { data, error } = await this.supabase.client
      .from('pago')
      .select(SELECT_PAGOS)
      .order('fecha_registro', { ascending: false });

    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo cargar la bandeja de pagos.'));
    }

    return (data ?? []) as unknown as Pago[];
  }

  async verifyPayment(params: RpcVerificarPagoParams): Promise<void> {
    const { error } = await this.supabase.client.rpc('rpc_verificar_pago', params);
    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo verificar el pago seleccionado.'));
    }
  }

  async getReportSalesPayments(): Promise<ReporteVentasPagosRow[]> {
    const { data, error } = await this.supabase.client
      .from('vw_reporte_ventas_pagos')
      .select(SELECT_REPORTE_VENTAS)
      .order('fecha_creacion', { ascending: false });

    if (error) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo consultar la vista de reporte de ventas y pagos.'),
      );
    }

    return (data ?? []) as ReporteVentasPagosRow[];
  }
}
