import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabaseUrl = import.meta.env.NG_APP_SUPABASE_URL;
  private readonly supabaseAnonKey = import.meta.env.NG_APP_SUPABASE_ANON_KEY;

  readonly qrBucket = import.meta.env.NG_APP_STORAGE_BUCKET_QR || 'comprobantes-qr';

  readonly client: SupabaseClient;

  constructor() {
    const isBrowser = isPlatformBrowser(this.platformId);
    this.client = createClient(this.supabaseUrl, this.supabaseAnonKey, {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
        detectSessionInUrl: isBrowser,
      },
    });
  }

  /**
   * Cliente efímero sin persistencia de sesión para dar de alta usuarios/empresas
   * mediante `auth.signUp` sin reemplazar la sesión activa del Administrador.
   */
  createSecondaryAuthClient(): SupabaseClient {
    return createClient(this.supabaseUrl, this.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'sb-admin-signup-ephemeral',
      },
    });
  }
}
