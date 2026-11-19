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
}

const SELECT_USERS =
  'id_usuario, email, nombre_completo, rol, activo, camion(id_camion, id_usuario, placa, capacidad_kg, disponible)';

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
      .update({ nombre_completo: payload.nombre_completo })
      .eq('id_usuario', idUsuario);

    if (userError) {
      throw new Error(translateSupabaseError(userError, 'No se pudo actualizar el usuario.'));
    }

    if (payload.rol === 'Camionero') {
      const camionPayload = {
        placa: payload.placa ?? '',
        capacidad_kg: Number(payload.capacidad_kg ?? 0),
        disponible: payload.disponible ?? true,
      };

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
}
