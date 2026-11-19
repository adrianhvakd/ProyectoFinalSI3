import { Injectable, inject } from '@angular/core';
import { Proveedor } from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';

export interface ProveedorPayload {
  identificacion_fiscal: string;
  razon_social: string;
  pais_origen: string;
  datos_contacto: string;
}

const SELECT_PROVEEDOR =
  'id_proveedor, identificacion_fiscal, razon_social, pais_origen, datos_contacto, activo';

@Injectable({
  providedIn: 'root',
})
export class ProvidersService {
  private readonly supabase = inject(SupabaseService);

  async getAll(): Promise<Proveedor[]> {
    const { data, error } = await this.supabase.client
      .from('proveedor')
      .select(SELECT_PROVEEDOR)
      .order('razon_social', { ascending: true });

    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo cargar el directorio de proveedores.'));
    }

    return (data ?? []) as Proveedor[];
  }

  async getActive(): Promise<Proveedor[]> {
    const { data, error } = await this.supabase.client
      .from('proveedor')
      .select(SELECT_PROVEEDOR)
      .eq('activo', true)
      .order('razon_social', { ascending: true });

    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo cargar los proveedores activos.'));
    }

    return (data ?? []) as Proveedor[];
  }

  async create(payload: ProveedorPayload): Promise<Proveedor> {
    const { data, error } = await this.supabase.client
      .from('proveedor')
      .insert({ ...payload, activo: true })
      .select(SELECT_PROVEEDOR)
      .single();

    if (error || !data) {
      throw new Error(translateSupabaseError(error, 'No se pudo registrar el proveedor.'));
    }

    return data as Proveedor;
  }

  async update(idProveedor: string, payload: ProveedorPayload): Promise<Proveedor> {
    const { data, error } = await this.supabase.client
      .from('proveedor')
      .update(payload)
      .eq('id_proveedor', idProveedor)
      .select(SELECT_PROVEEDOR)
      .single();

    if (error || !data) {
      throw new Error(translateSupabaseError(error, 'No se pudo actualizar el proveedor.'));
    }

    return data as Proveedor;
  }

  async toggleActive(idProveedor: string, activo: boolean): Promise<Proveedor> {
    const { data, error } = await this.supabase.client
      .from('proveedor')
      .update({ activo })
      .eq('id_proveedor', idProveedor)
      .select(SELECT_PROVEEDOR)
      .single();

    if (error || !data) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo cambiar el estado del proveedor.'),
      );
    }

    return data as Proveedor;
  }
}
