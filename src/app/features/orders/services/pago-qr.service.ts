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
    if (solicitud.modalidadEntrega === 'Envío a dirección en camión') {
      if (!solicitud.direccionDestino || solicitud.direccionDestino.trim().length < 5) {
        return 'Debe confirmar una dirección de entrega válida para envío en camión.';
      }
      const phone = (solicitud.celularContacto ?? '').trim();
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15 || !/^\+?[\d\s-]{7,20}$/.test(phone)) {
        return 'Ingrese un número de celular de contacto válido para la entrega.';
      }
      if (
        typeof solicitud.latitud !== 'number' ||
        !Number.isFinite(solicitud.latitud) ||
        typeof solicitud.longitud !== 'number' ||
        !Number.isFinite(solicitud.longitud)
      ) {
        return 'Seleccione el punto exacto de entrega en el mapa interactivo.';
      }
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

    const isDelivery = solicitud.modalidadEntrega === 'Envío a dirección en camión';
    const rpcParams: RpcCrearPedidoConPagoParams = {
      p_id_empresa_cliente: solicitud.idEmpresaCliente,
      p_modalidad_entrega: solicitud.modalidadEntrega,
      p_direccion_destino: isDelivery ? solicitud.direccionDestino : null,
      p_metodo_pago: 'QR',
      p_url_comprobante_qr: publicUrl,
      p_items: solicitud.items,
      p_latitud: isDelivery ? solicitud.latitud : null,
      p_longitud: isDelivery ? solicitud.longitud : null,
      p_celular_contacto: isDelivery ? solicitud.celularContacto : null,
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
