import { InjectionToken } from '@angular/core';
import {
  MetodoPago,
  ModalidadEntrega,
  RpcPedidoItemParam,
} from '../../../core/models/domain.models';

export interface SolicitudPedidoPago {
  idEmpresaCliente: string;
  modalidadEntrega: ModalidadEntrega;
  direccionDestino: string | null;
  latitud: number | null;
  longitud: number | null;
  celularContacto: string | null;
  items: RpcPedidoItemParam[];
  archivoComprobante?: File | null;
}

export interface ResultadoProcesamientoPago {
  numeroPedido: number;
  metodo: MetodoPago;
  urlComprobanteQr: string | null;
}

export interface IProcesadorPago {
  readonly metodo: MetodoPago;
  validar(solicitud: SolicitudPedidoPago): string | null;
  procesarPago(solicitud: SolicitudPedidoPago): Promise<ResultadoProcesamientoPago>;
}

export const PROCESADORES_PAGO = new InjectionToken<readonly IProcesadorPago[]>('PROCESADORES_PAGO');
