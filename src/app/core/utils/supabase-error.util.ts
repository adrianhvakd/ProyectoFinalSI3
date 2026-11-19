interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
}

export function translateSupabaseError(
  error: unknown,
  fallback = 'Ocurrió un error al procesar la operación.',
): string {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string') {
    return mapErrorMessage(error, fallback);
  }

  const err = error as SupabaseErrorLike;
  const code = err.code ?? '';
  const msg = err.message ?? '';

  if (code === '23505') {
    if (msg.toLowerCase().includes('codigo_unico')) {
      return 'Ya existe un lote registrado con ese código único.';
    }
    if (msg.toLowerCase().includes('codigo')) {
      return 'Ya existe un registro con ese código.';
    }
    if (msg.toLowerCase().includes('nit')) {
      return 'El NIT ingresado ya se encuentra registrado.';
    }
    if (msg.toLowerCase().includes('identificacion_fiscal')) {
      return 'La identificación fiscal ingresada ya pertenece a otro proveedor.';
    }
    if (msg.toLowerCase().includes('placa')) {
      return 'La placa vehicular ingresada ya está asignada a otro camión.';
    }
    if (msg.toLowerCase().includes('email')) {
      return 'El correo electrónico ya está registrado en el sistema.';
    }
    return 'Ya existe un registro con los mismos datos únicos.';
  }

  if (code === '23503') {
    return 'No es posible completar la operación porque el registro está vinculado a otros movimientos del sistema.';
  }

  if (code === '23514') {
    return 'Uno o más valores incumplen las reglas de validación establecidas en la base de datos.';
  }

  if (code === '22P02') {
    return 'El formato de uno de los datos enviados no es válido.';
  }

  if (code === '42501') {
    return 'No cuenta con permisos suficientes para ejecutar esta operación.';
  }

  if (code === 'PGRST116') {
    return 'No se encontró el registro solicitado.';
  }

  return mapErrorMessage(msg, fallback);
}

function mapErrorMessage(rawMessage: string, fallback: string): string {
  const normalized = rawMessage.trim();
  if (!normalized) {
    return fallback;
  }

  const lower = normalized.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Correo electrónico o contraseña incorrectos.';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'El correo electrónico ya se encuentra registrado en el sistema.';
  }
  if (lower.includes('email not confirmed')) {
    return 'La cuenta aún requiere confirmación de correo electrónico.';
  }
  if (lower.includes('password should be at least')) {
    return 'La contraseña no cumple con la longitud mínima requerida.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Se alcanzó el límite temporal de solicitudes. Intente nuevamente en unos momentos.';
  }
  if (lower.includes('payload too large') || lower.includes('maximum allowed size')) {
    return 'El archivo supera el tamaño máximo permitido de 5 MB.';
  }
  if (lower.includes('mime type') || lower.includes('invalid file type')) {
    return 'El formato de archivo no es compatible. Use PNG, JPG o PDF.';
  }
  if (lower.includes('row-level security')) {
    return 'Acceso denegado por las políticas de seguridad de datos.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'No se pudo establecer conexión con el servidor. Verifique su conexión de red.';
  }

  return normalized;
}
