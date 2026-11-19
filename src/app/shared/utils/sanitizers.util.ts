export function sanitizeText(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeMultilineText(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

export function sanitizeEmail(value: string | null | undefined): string {
  return sanitizeText(value).toLowerCase();
}

export function sanitizeCode(value: string | null | undefined): string {
  return sanitizeText(value).toUpperCase();
}

export function sanitizePlate(value: string | null | undefined): string {
  return sanitizeText(value).toUpperCase();
}

export function sanitizeNit(value: string | null | undefined): string {
  return sanitizeText(value).toUpperCase();
}

export function sanitizePhone(value: string | null | undefined): string {
  return sanitizeText(value);
}

export function toLocalDateIso(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function extractDateKey(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return toLocalDateIso(parsed);
}
