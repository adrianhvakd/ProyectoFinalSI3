import { Injectable, inject } from '@angular/core';
import { EmpresaClienteConUsuario } from '../../../core/models/domain.models';
import { SupabaseService } from '../../../core/services/supabase.service';
import { translateSupabaseError } from '../../../core/utils/supabase-error.util';

export interface CreateClientCompanyPayload {
  nombre_completo: string;
  email: string;
  password: string;
  nit: string;
  razon_social: string;
  telefono: string;
  direccion_entrega: string;
}

export interface UpdateClientCompanyPayload {
  nombre_completo: string;
  nit: string;
  razon_social: string;
  telefono: string;
  direccion_entrega: string;
}

const SELECT_CLIENT_COMPANIES =
  'id_empresa_cliente, id_usuario, nit, razon_social, telefono, direccion_entrega, usuario(id_usuario, email, nombre_completo, rol, activo)';

@Injectable({
  providedIn: 'root',
})
export class ClientCompaniesService {
  private readonly supabase = inject(SupabaseService);

  async getAll(): Promise<EmpresaClienteConUsuario[]> {
    const { data, error } = await this.supabase.client
      .from('empresa_cliente')
      .select(SELECT_CLIENT_COMPANIES)
      .order('razon_social', { ascending: true });

    if (error) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo cargar el directorio de empresas clientes.'),
      );
    }

    return (data ?? []) as unknown as EmpresaClienteConUsuario[];
  }

  async createClientCompany(payload: CreateClientCompanyPayload): Promise<void> {
    const secondaryClient = this.supabase.createSecondaryAuthClient();

    const { data, error } = await secondaryClient.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          nombre_completo: payload.nombre_completo,
          rol: 'Empresa Cliente',
          nit: payload.nit,
          razon_social: payload.razon_social,
          telefono: payload.telefono,
          direccion_entrega: payload.direccion_entrega,
        },
      },
    });

    if (error) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo registrar la empresa cliente.'),
      );
    }

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('El correo electrónico ya se encuentra registrado en el sistema.');
    }
  }

  async updateClientCompany(
    idEmpresaCliente: string,
    idUsuario: string,
    payload: UpdateClientCompanyPayload,
  ): Promise<void> {
    const { error: empresaError } = await this.supabase.client
      .from('empresa_cliente')
      .update({
        nit: payload.nit,
        razon_social: payload.razon_social,
        telefono: payload.telefono,
        direccion_entrega: payload.direccion_entrega,
      })
      .eq('id_empresa_cliente', idEmpresaCliente);

    if (empresaError) {
      throw new Error(
        translateSupabaseError(empresaError, 'No se pudo actualizar los datos de la empresa.'),
      );
    }

    const { error: userError } = await this.supabase.client
      .from('usuario')
      .update({ nombre_completo: payload.nombre_completo })
      .eq('id_usuario', idUsuario);

    if (userError) {
      throw new Error(
        translateSupabaseError(userError, 'No se pudo actualizar el contacto principal.'),
      );
    }
  }

  async toggleUserActive(idUsuario: string, activo: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from('usuario')
      .update({ activo })
      .eq('id_usuario', idUsuario);

    if (error) {
      throw new Error(
        translateSupabaseError(error, 'No se pudo cambiar el estado de la empresa cliente.'),
      );
    }
  }
}
