import { Injectable, inject } from '@angular/core';
import {
  MateriaPrima,
  ParametroCalidad,
  normalizeQualityParameters,
} from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';

export interface MateriaPrimaPayload {
  nombre: string;
  unidad_medida: string;
  precio_mayorista: number;
  cantidad_minima_venta: number;
  parametros_calidad_exigidos: ParametroCalidad[];
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

    return (data ?? []).map((row) => this.normalizeRow(row));
  }

  async create(payload: MateriaPrimaPayload): Promise<MateriaPrima> {
    const { data, error } = await this.supabase.client
      .from('materia_prima')
      .insert(payload)
      .select(SELECT_MATERIA_PRIMA)
      .single();

    if (error || !data) {
      throw new Error(translateSupabaseError(error, 'No se pudo registrar la materia prima.'));
    }

    return this.normalizeRow(data);
  }

  async update(idMateriaPrima: string, payload: MateriaPrimaPayload): Promise<MateriaPrima> {
    const { data, error } = await this.supabase.client
      .from('materia_prima')
      .update(payload)
      .eq('id_materia_prima', idMateriaPrima)
      .select(SELECT_MATERIA_PRIMA)
      .single();

    if (error || !data) {
      throw new Error(translateSupabaseError(error, 'No se pudo actualizar la materia prima.'));
    }

    return this.normalizeRow(data);
  }

  private normalizeRow(row: unknown): MateriaPrima {
    const raw = row as Record<string, unknown>;
    return {
      id_materia_prima: String(raw['id_materia_prima'] ?? ''),
      codigo: String(raw['codigo'] ?? ''),
      nombre: String(raw['nombre'] ?? ''),
      unidad_medida: String(raw['unidad_medida'] ?? ''),
      precio_mayorista: Number(raw['precio_mayorista'] ?? 0),
      cantidad_minima_venta: Number(raw['cantidad_minima_venta'] ?? 0),
      parametros_calidad_exigidos: normalizeQualityParameters(raw['parametros_calidad_exigidos']),
      stock_disponible_total: Number(raw['stock_disponible_total'] ?? 0),
    };
  }
}
