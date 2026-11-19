import { Injectable, inject } from '@angular/core';
import { RpcCrearPedidoConPagoParams } from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';
import { validateAttachmentFile } from '../../../shared/utils/validators.util';
import {
  IProcesadorPago,
  ResultadoProcesamientoPago,
  SolicitudPedidoPago,
} from '../contracts/procesador-pago.interface';

@Injectable({
  providedIn: 'root',
})
export class PagoQRService implements IProcesadorPago {
  private readonly supabase = inject(SupabaseService);

  readonly metodo = 'QR' as const;

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
    return validateAttachmentFile(solicitud.archivoComprobante);
  }

  async procesarPago(solicitud: SolicitudPedidoPago): Promise<ResultadoProcesamientoPago> {
    const validationError = this.validar(solicitud);
    if (validationError) {
      throw new Error(validationError);
    }

    const file = solicitud.archivoComprobante!;
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${solicitud.idEmpresaCliente}/${Date.now()}-${sanitizedName}`;
    const bucket = this.supabase.qrBucket;

    const { error: uploadError } = await this.supabase.client.storage
      .from(bucket)
      .upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(
        translateSupabaseError(uploadError, 'No se pudo subir el comprobante QR al almacenamiento.'),
      );
    }

    const { data: urlData } = this.supabase.client.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    const rpcParams: RpcCrearPedidoConPagoParams = {
      p_id_empresa_cliente: solicitud.idEmpresaCliente,
      p_modalidad_entrega: solicitud.modalidadEntrega,
      p_direccion_destino:
        solicitud.modalidadEntrega === 'Envío a dirección en camión'
          ? solicitud.direccionDestino
          : null,
      p_metodo_pago: 'QR',
      p_url_comprobante_qr: publicUrl,
      p_items: solicitud.items,
    };

    const { data, error } = await this.supabase.client.rpc('rpc_crear_pedido_con_pago', rpcParams);

    if (error || data === null || data === undefined) {
      await this.supabase.client.storage.from(bucket).remove([storagePath]).catch(() => undefined);
      throw new Error(
        translateSupabaseError(error, 'No se pudo registrar el pedido con comprobante QR.'),
      );
    }

    return {
      numeroPedido: Number(data),
      metodo: 'QR',
      urlComprobanteQr: publicUrl,
    };
  }
}
