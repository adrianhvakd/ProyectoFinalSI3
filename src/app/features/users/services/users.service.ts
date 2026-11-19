import { Injectable, inject } from '@angular/core';
import { RolUsuario, UsuarioConRelaciones } from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';

export interface CreateUserPayload {
  email: string;
  password: string;
  nombre_completo: string;
  rol: RolUsuario;
  placa?: string;
  capacidad_kg?: number;
}

export interface UpdateUserPayload {
  nombre_completo: string;
  rol: RolUsuario;
  placa?: string;
  capacidad_kg?: number;
  disponible?: boolean;
  nit?: string;
  razon_social?: string;
  telefono?: string;
  direccion?: string;
}

const SELECT_USERS =
  'id_usuario, email, nombre_completo, rol, activo, camion(id_camion, id_usuario, placa, capacidad_kg, disponible), empresa_cliente(id_empresa_cliente, id_usuario, nit, razon_social, telefono, direccion)';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly supabase = inject(SupabaseService);

  async getAll(): Promise<UsuarioConRelaciones[]> {
    const { data, error } = await this.supabase.client
      .from('usuario')
      .select(SELECT_USERS)
      .order('nombre_completo', { ascending: true });

    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo cargar la lista de usuarios.'));
    }

    return (data ?? []) as unknown as UsuarioConRelaciones[];
  }

  async createUser(payload: CreateUserPayload): Promise<void> {
    const secondaryClient = this.supabase.createSecondaryAuthClient();

    const metadata: Record<string, string | number> = {
      nombre_completo: payload.nombre_completo,
      rol: payload.rol,
    };

    if (payload.rol === 'Camionero') {
      metadata['placa'] = payload.placa ?? '';
      metadata['capacidad_kg'] = Number(payload.capacidad_kg ?? 0);
    }

    const { data, error } = await secondaryClient.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: metadata,
      },
    });

    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo crear la cuenta de usuario.'));
    }

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('El correo electrónico ya se encuentra registrado en el sistema.');
    }
  }

  async updateUser(idUsuario: string, payload: UpdateUserPayload): Promise<void> {
    const { error: userError } = await this.supabase.client
      .from('usuario')
      .update({
        nombre_completo: payload.nombre_completo,
        rol: payload.rol,
      })
      .eq('id_usuario', idUsuario);

    if (userError) {
      throw new Error(translateSupabaseError(userError, 'No se pudo actualizar el usuario.'));
    }

    if (payload.rol === 'Camionero') {
      await this.upsertTruckProfile(idUsuario, {
        placa: payload.placa ?? '',
        capacidad_kg: Number(payload.capacidad_kg ?? 0),
        disponible: payload.disponible ?? true,
      });
    } else if (payload.rol === 'Empresa Cliente') {
      await this.upsertClientCompanyProfile(idUsuario, {
        nit: payload.nit ?? '',
        razon_social: payload.razon_social ?? '',
        telefono: payload.telefono ?? '',
        direccion: payload.direccion ?? '',
      });
    }
  }

  async toggleActive(idUsuario: string, activo: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from('usuario')
      .update({ activo })
      .eq('id_usuario', idUsuario);

    if (error) {
      throw new Error(translateSupabaseError(error, 'No se pudo cambiar el estado del usuario.'));
    }
  }

  private async upsertTruckProfile(
    idUsuario: string,
    camionPayload: { placa: string; capacidad_kg: number; disponible: boolean },
  ): Promise<void> {
    const { data: existingCamion } = await this.supabase.client
      .from('camion')
      .select('id_camion')
      .eq('id_usuario', idUsuario)
      .maybeSingle();

    if (existingCamion) {
      const { error: camionError } = await this.supabase.client
        .from('camion')
        .update(camionPayload)
        .eq('id_usuario', idUsuario);

      if (camionError) {
        throw new Error(
          translateSupabaseError(camionError, 'No se pudo actualizar los datos del camión.'),
        );
      }
    } else {
      const { error: insertError } = await this.supabase.client
        .from('camion')
        .insert({ id_usuario: idUsuario, ...camionPayload });

      if (insertError) {
        throw new Error(
          translateSupabaseError(insertError, 'No se pudo registrar el camión asignado.'),
        );
      }
    }
  }

  private async upsertClientCompanyProfile(
    idUsuario: string,
    empresaPayload: { nit: string; razon_social: string; telefono: string; direccion: string },
  ): Promise<void> {
    const { data: existingEmpresa } = await this.supabase.client
      .from('empresa_cliente')
      .select('id_empresa_cliente')
      .eq('id_usuario', idUsuario)
      .maybeSingle();

    if (existingEmpresa) {
      const { error: empresaError } = await this.supabase.client
        .from('empresa_cliente')
        .update(empresaPayload)
        .eq('id_usuario', idUsuario);

      if (empresaError) {
        throw new Error(
          translateSupabaseError(
            empresaError,
            'No se pudo actualizar la ficha de empresa cliente.',
          ),
        );
      }
    } else {
      const { error: insertError } = await this.supabase.client
        .from('empresa_cliente')
        .insert({ id_usuario: idUsuario, ...empresaPayload });

      if (insertError) {
        throw new Error(
          translateSupabaseError(insertError, 'No se pudo crear la ficha de empresa cliente.'),
        );
      }
    }
  }
}
