import { Injectable, inject } from '@angular/core';
import { RpcCrearPedidoConPagoParams } from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';
import {
  IProcesadorPago,
  ResultadoProcesamientoPago,
  SolicitudPedidoPago,
} from '../contracts/procesador-pago.interface';

@Injectable({
  providedIn: 'root',
})
export class PagoEfectivoService implements IProcesadorPago {
  private readonly supabase = inject(SupabaseService);

  readonly metodo = 'Efectivo' as const;

  validar(solicitud: SolicitudPedidoPago): string | null {
    if (!solicitud.items || solicitud.items.length === 0) {
      return 'El pedido debe contener al menos un producto.';
    }
    if (
      solicitud.modalidadEntrega === 'Envío a dirección en camión' &&
      (!solicitud.direccionDestino || solicitud.direccionDestino.trim().length < 5)
    ) {
      return 'Debe confirmar una dirección de entrega válida para envío en camión.';
    }
    return null;
  }

  async procesarPago(solicitud: SolicitudPedidoPago): Promise<ResultadoProcesamientoPago> {
    const validationError = this.validar(solicitud);
    if (validationError) {
      throw new Error(validationError);
    }

    const rpcParams: RpcCrearPedidoConPagoParams = {
      p_id_empresa_cliente: solicitud.idEmpresaCliente,
      p_modalidad_entrega: solicitud.modalidadEntrega,
      p_direccion_destino:
        solicitud.modalidadEntrega === 'Envío a dirección en camión'
          ? solicitud.direccionDestino
          : null,
      p_metodo_pago: 'Efectivo',
      p_url_comprobante_qr: null,
      p_items: solicitud.items,
    };

    const { data, error } = await this.supabase.client.rpc('rpc_crear_pedido_con_pago', rpcParams);

    if (error || data === null || data === undefined) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo registrar el pedido para pago en efectivo.'),
      );
    }

    return {
      numeroPedido: Number(data),
      metodo: 'Efectivo',
      urlComprobanteQr: null,
    };
  }
}
