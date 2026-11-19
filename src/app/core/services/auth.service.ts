import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Camion,
  EmpresaCliente,
  RolUsuario,
  UsuarioConRelaciones,
  unwrapOne,
} from '../models/domain.models';
import { translateSupabaseError } from '../utils/supabase-error.util';
import { SupabaseService } from './supabase.service';

const USER_PROFILE_SELECT =
  'id_usuario, email, nombre_completo, rol, activo, empresa_cliente(id_empresa_cliente, id_usuario, nit, razon_social, telefono, direccion_entrega), camion(id_camion, id_usuario, placa, capacidad_kg, disponible)';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _user = signal<UsuarioConRelaciones | null>(null);
  private readonly _loading = signal<boolean>(true);
  private initPromise: Promise<UsuarioConRelaciones | null> | null = null;

  readonly user = this._user.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly role = computed<RolUsuario | null>(() => this._user()?.rol ?? null);
  readonly empresaCliente = computed<EmpresaCliente | null>(() =>
    unwrapOne(this._user()?.empresa_cliente),
  );
  readonly camion = computed<Camion | null>(() => unwrapOne(this._user()?.camion));

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.supabase.client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          this._user.set(null);
          return;
        }
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          void this.refreshCurrentProfile(session.user.id);
        }
      });
    }
  }

  async ensureSessionLoaded(): Promise<UsuarioConRelaciones | null> {
    if (!isPlatformBrowser(this.platformId)) {
      this._loading.set(false);
      return null;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeSession();
    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async initializeSession(): Promise<UsuarioConRelaciones | null> {
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.getSession();
      if (error || !data.session?.user) {
        this._user.set(null);
        return null;
      }

      const profile = await this.fetchAndValidateProfile(data.session.user.id);
      this._user.set(profile);
      return profile;
    } catch {
      await this.supabase.client.auth.signOut().catch(() => undefined);
      this._user.set(null);
      return null;
    } finally {
      this._loading.set(false);
    }
  }

  async signIn(email: string, password: string): Promise<UsuarioConRelaciones> {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await this.supabase.client.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data.user) {
      throw new Error(translateSupabaseError(error, 'No se pudo iniciar sesión.'));
    }

    try {
      const profile = await this.fetchAndValidateProfile(data.user.id);
      this._user.set(profile);
      this._loading.set(false);
      return profile;
    } catch (profileErr) {
      await this.supabase.client.auth.signOut().catch(() => undefined);
      this._user.set(null);
      throw profileErr;
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.supabase.client.auth.signOut();
    } finally {
      this._user.set(null);
      this.initPromise = null;
      await this.router.navigateByUrl('/login');
    }
  }

  async reloadProfile(): Promise<UsuarioConRelaciones | null> {
    const current = this._user();
    if (!current) {
      return null;
    }
    const profile = await this.fetchAndValidateProfile(current.id_usuario);
    this._user.set(profile);
    return profile;
  }

  getDefaultRouteForRole(role: RolUsuario | null | undefined): string {
    switch (role) {
      case 'Administrador':
        return '/catalog';
      case 'Encargado de Almacén':
        return '/warehouse/inventory';
      case 'Encargado de Ventas y Caja':
        return '/sales/payments';
      case 'Empresa Cliente':
        return '/orders/catalog';
      case 'Encargado de Despacho':
      case 'Camionero':
        return '/account';
      default:
        return '/login';
    }
  }

  private async refreshCurrentProfile(userId: string): Promise<void> {
    try {
      const profile = await this.fetchAndValidateProfile(userId);
      this._user.set(profile);
    } catch {
      await this.signOut();
    }
  }

  private async fetchAndValidateProfile(userId: string): Promise<UsuarioConRelaciones> {
    const { data, error } = await this.supabase.client
      .from('usuario')
      .select(USER_PROFILE_SELECT)
      .eq('id_usuario', userId)
      .single();

    if (error || !data) {
      throw new Error(
        translateSupabaseError(
          error,
          'No se encontró el perfil operativo asociado a su cuenta.',
        ),
      );
    }

    const profile = data as unknown as UsuarioConRelaciones;
    if (profile.activo !== true) {
      throw new Error(
        'Cuenta inactiva. Contacte al Administrador para habilitar su acceso.',
      );
    }

    return profile;
  }
}
