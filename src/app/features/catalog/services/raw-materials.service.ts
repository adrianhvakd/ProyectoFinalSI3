import { Injectable, inject } from '@angular/core';
import { MateriaPrima } from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';

export interface MateriaPrimaPayload {
  codigo: string;
  nombre: string;
  unidad_medida: string;
  precio_mayorista: number;
  cantidad_minima_venta: number;
  parametros_calidad_exigidos: string;
}

const SELECT_MATERIA_PRIMA =
  'id_materia_prima, codigo, nombre, unidad_medida, precio_mayorista, cantidad_minima_venta, parametros_calidad_exigidos, stock_disponible_total';

@Injectable({
  providedIn: 'root',
})
export class RawMaterialsService {
  private readonly supabase = inject(SupabaseService);

  async getAll(): Promise<MateriaPrima[]> {
    const { data, error } = await this.supabase.client
      .from('materia_prima')
      .select(SELECT_MATERIA_PRIMA)
      .order('nombre', { ascending: true });

    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo cargar el catálogo de materias primas.'));
    }

    return (data ?? []) as MateriaPrima[];
  }

  async checkCodeExists(codigo: string, excludeId?: string): Promise<boolean> {
    let query = this.supabase.client
      .from('materia_prima')
      .select('id_materia_prima')
      .ilike('codigo', codigo);

    if (excludeId) {
      query = query.neq('id_materia_prima', excludeId);
    }

    const { data, error } = await query.limit(1);
    if (error) {
      return false;
    }
    return (data?.length ?? 0) > 0;
  }

  async create(payload: MateriaPrimaPayload): Promise<MateriaPrima> {
    const exists = await this.checkCodeExists(payload.codigo);
    if (exists) {
      throw new Error(`El código "${payload.codigo}" ya está registrado en otra materia prima.`);
    }

    const { data, error } = await this.supabase.client
      .from('materia_prima')
      .insert(payload)
      .select(SELECT_MATERIA_PRIMA)
      .single();

    if (error || !data) {
      throw new Error(translateSupabaseError(error, 'No se pudo registrar la materia prima.'));
    }

    return data as MateriaPrima;
  }

  async update(idMateriaPrima: string, payload: MateriaPrimaPayload): Promise<MateriaPrima> {
    const exists = await this.checkCodeExists(payload.codigo, idMateriaPrima);
    if (exists) {
      throw new Error(`El código "${payload.codigo}" ya está registrado en otra materia prima.`);
    }

    const { data, error } = await this.supabase.client
      .from('materia_prima')
      .update(payload)
      .eq('id_materia_prima', idMateriaPrima)
      .select(SELECT_MATERIA_PRIMA)
      .single();

    if (error || !data) {
      throw new Error(translateSupabaseError(error, 'No se pudo actualizar la materia prima.'));
    }

    return data as MateriaPrima;
  }
}
