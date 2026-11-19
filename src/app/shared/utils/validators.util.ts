import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { toLocalDateIso } from './sanitizers.util';

export const ALLOWED_RECEIPT_MIMES = ['image/png', 'image/jpeg', 'application/pdf'] as const;
export const ALLOWED_RECEIPT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf'] as const;
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export function trimmedRequiredValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    if (raw === null || raw === undefined) {
      return { required: true };
    }
    if (typeof raw === 'string' && raw.trim().length === 0) {
      return { required: true };
    }
    return null;
  };
}

export function trimmedMinLengthValidator(minLength: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? '').trim();
    if (!raw) {
      return null;
    }
    return raw.length >= minLength
      ? null
      : { minlength: { requiredLength: minLength, actualLength: raw.length } };
  };
}

export function positiveDecimalValidator(allowZero = false): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    if (raw === null || raw === undefined || raw === '') {
      return null;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      return { invalidNumber: true };
    }
    if (allowZero ? num < 0 : num <= 0) {
      return { positiveDecimal: true };
    }
    return null;
  };
}

export function nitValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = String(control.value ?? '').trim();
    if (!val) {
      return null;
    }
    return /^[0-9A-Za-z-]{5,20}$/.test(val) ? null : { nitFormat: true };
  };
}

export function phoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = String(control.value ?? '').trim();
    if (!val) {
      return null;
    }
    const digits = val.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15 || !/^[+\d\s()-]{7,20}$/.test(val)) {
      return { phoneFormat: true };
    }
    return null;
  };
}

export function vehiclePlateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = String(control.value ?? '').trim();
    if (!val) {
      return null;
    }
    return /^[A-Z0-9-]{4,15}$/i.test(val) ? null : { plateFormat: true };
  };
}

export function uniqueCodeFormatValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = String(control.value ?? '').trim();
    if (!val) {
      return null;
    }
    return /^[A-Z0-9._-]{2,40}$/i.test(val) ? null : { codeFormat: true };
  };
}

export function notExpiredDateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = String(control.value ?? '').trim();
    if (!val) {
      return null;
    }
    const today = toLocalDateIso();
    return val > today ? null : { expiredDate: true };
  };
}

export function dateAfterFieldValidator(startControlName: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const parent = control.parent;
    if (!parent) {
      return null;
    }
    const startValue = String(parent.get(startControlName)?.value ?? '').trim();
    const endValue = String(control.value ?? '').trim();
    if (!startValue || !endValue) {
      return null;
    }
    return endValue > startValue ? null : { dateOrder: true };
  };
}

export function validateAttachmentFile(
  file: File | null | undefined,
  maxBytes = MAX_RECEIPT_BYTES,
): string | null {
  if (!file) {
    return 'Debe adjuntar un archivo de comprobante.';
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_RECEIPT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasAllowedMime = (ALLOWED_RECEIPT_MIMES as readonly string[]).includes(file.type);

  if (!hasAllowedMime && !hasAllowedExt) {
    return 'Formato de comprobante no válido. Solo se permiten archivos PNG, JPG o PDF.';
  }

  if (file.size <= 0) {
    return 'El archivo seleccionado está vacío.';
  }

  if (file.size > maxBytes) {
    return 'El comprobante excede el tamaño máximo permitido de 5 MB.';
  }

  return null;
}
