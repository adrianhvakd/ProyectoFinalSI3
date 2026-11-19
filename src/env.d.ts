interface Env {
  readonly NG_APP_ENV?: string;
  readonly NG_APP_SUPABASE_URL: string;
  readonly NG_APP_SUPABASE_ANON_KEY: string;
  readonly NG_APP_STORAGE_BUCKET_QR: string;
}

interface ImportMeta {
  readonly env: Env;
}
