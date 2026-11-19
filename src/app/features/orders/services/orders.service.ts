import { Injectable, inject } from '@angular/core';
import {
  Lote,
  MateriaPrima,
  Pedido,
  RpcReenviarComprobanteQrParams,
  unwrapOne,
} from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';
import { validateAttachmentFile } from '../../../shared/utils/validators.util';

export interface LoteDisponibleFEFO {
  id_lote: string;
  codigo_unico: string;
  cantidad_disponible: number;
  fecha_vencimiento: string;
}

export interface CatalogoProductoDisponible {
  materiaPrima: MateriaPrima;
  stockEfectivo: number;
  lotesDisponibles: LoteDisponibleFEFO[];
}

export interface AsignacionLote {
  id_lote: string;
  codigo_unico: string;
  cantidad: number;
}

const SELECT_LOTES_DISPONIBLES =
  'id_lote, codigo_unico, id_materia_prima, cantidad_disponible, fecha_vencimiento, estado, materia_prima(id_materia_prima, codigo, nombre, unidad_medida, precio_mayorista, cantidad_minima_venta, parametros_calidad_exigidos, stock_disponible_total)';

const SELECT_MIS_PEDIDOS =
  'numero_pedido, id_empresa_cliente, modalidad_entrega, direccion_destino, latitud, longitud, celular_contacto, subtotal_mayorista, estado_pedido, estado_entrega, fecha_creacion, detalle_pedido(id_detalle, numero_pedido, id_materia_prima, id_lote, cantidad_solicitada, precio_unitario_mayorista, subtotal, materia_prima(id_materia_prima, codigo, nombre, unidad_medida), lote(id_lote, codigo_unico)), pago(id_pago, numero_pedido, metodo, monto, url_comprobante_qr, estado, motivo_observacion, fecha_registro, fecha_verificacion)';

@Injectable({
  providedIn: 'root',
})
export class OrdersService {
  private readonly supabase = inject(SupabaseService);

  async getAvailableWholesaleCatalog(): Promise<CatalogoProductoDisponible[]> {
    const { data, error } = await this.supabase.client
      .from('lote')
      .select(SELECT_LOTES_DISPONIBLES)
      .eq('estado', 'Aprobado / Disponible')
      .gt('cantidad_disponible', 0)
      .order('fecha_vencimiento', { ascending: true });

    if (error) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo cargar el catálogo mayorista disponible.'),
      );
    }

    const lots = (data ?? []) as unknown as Lote[];
    const grouped = new Map<string, CatalogoProductoDisponible>();

    for (const lote of lots) {
      const mp = unwrapOne(lote.materia_prima);
      const qty = Number(lote.cantidad_disponible);
      if (!mp || !Number.isFinite(qty) || qty <= 0) {
        continue;
      }

      const lotEntry: LoteDisponibleFEFO = {
        id_lote: lote.id_lote,
        codigo_unico: lote.codigo_unico,
        cantidad_disponible: qty,
        fecha_vencimiento: lote.fecha_vencimiento,
      };

      const existing = grouped.get(mp.id_materia_prima);
      if (existing) {
        existing.stockEfectivo = Math.round((existing.stockEfectivo + qty) * 100) / 100;
        existing.lotesDisponibles.push(lotEntry);
      } else {
        grouped.set(mp.id_materia_prima, {
          materiaPrima: mp,
          stockEfectivo: Math.round(qty * 100) / 100,
          lotesDisponibles: [lotEntry],
        });
      }
    }

    return Array.from(grouped.values())
      .filter((item) => item.stockEfectivo > 0)
      .sort((a, b) => a.materiaPrima.nombre.localeCompare(b.materiaPrima.nombre));
  }

  allocateLotsFEFO(
    lotesDisponibles: readonly LoteDisponibleFEFO[],
    cantidadSolicitada: number,
  ): AsignacionLote[] {
    let remaining = Math.round(cantidadSolicitada * 100) / 100;
    const allocations: AsignacionLote[] = [];

    for (const lot of lotesDisponibles) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(remaining, lot.cantidad_disponible);
      const roundedTake = Math.round(take * 100) / 100;
      if (roundedTake > 0) {
        allocations.push({
          id_lote: lot.id_lote,
          codigo_unico: lot.codigo_unico,
          cantidad: roundedTake,
        });
        remaining = Math.round((remaining - roundedTake) * 100) / 100;
      }
    }

    return allocations;
  }

  async getMyOrders(idEmpresaCliente: string): Promise<Pedido[]> {
    const { data, error } = await this.supabase.client
      .from('pedido')
      .select(SELECT_MIS_PEDIDOS)
      .eq('id_empresa_cliente', idEmpresaCliente)
      .order('fecha_creacion', { ascending: false });

    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo consultar su historial de pedidos.'));
    }

    return (data ?? []) as unknown as Pedido[];
  }

  async resubmitQrReceipt(idPago: string, idEmpresaCliente: string, file: File): Promise<string> {
    const validationError = validateAttachmentFile(file);
    if (validationError) {
      throw new Error(validationError);
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${idEmpresaCliente}/reenvio-${Date.now()}-${sanitizedName}`;
    const bucket = this.supabase.qrBucket;

    const { error: uploadError } = await this.supabase.client.storage
      .from(bucket)
      .upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(
        translateSupabaseError(uploadError, 'No se pudo cargar el nuevo comprobante QR.'),
      );
    }

    const { data: urlData } = this.supabase.client.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    const rpcParams: RpcReenviarComprobanteQrParams = {
      p_id_pago: idPago,
      p_nueva_url_comprobante: publicUrl,
    };

    const { error } = await this.supabase.client.rpc('rpc_reenviar_comprobante_qr', rpcParams);

    if (error) {
      await this.supabase.client.storage.from(bucket).remove([storagePath]).catch(() => undefined);
      throw new Error(
        translateSupabaseError(error, 'No se pudo actualizar el comprobante del pago.'),
      );
    }

    return publicUrl;
  }
}
