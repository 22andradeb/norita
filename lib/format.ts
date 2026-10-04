// Spanish (Spain) formatting for dates, numbers and messages shown in the app.

export const LOCALE = 'es-ES';

export const fmtNum = (v: number, decimals = 0) =>
  v.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

export const fmtWhen = (iso: string | Date) =>
  new Date(iso).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const fmtDay = (d: Date) => d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

export const fmtShortDate = (d: Date | number) => new Date(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });

/** Capitalises the first letter ("sábado, 4 de octubre" → "Sábado, 4 de octubre"). */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const DAY_MS = 86_400_000;

export function timeAgo(iso: string, now = Date.now()) {
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round((now - Date.parse(iso)) / DAY_MS);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Messages from Supabase and our own database functions arrive in English; show them in Spanish.
const ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'El correo o la contraseña no son correctos.'],
  [/email not confirmed/i, 'Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.'],
  [/user already registered/i, 'Ya existe una cuenta con este correo.'],
  [/password should be at least/i, 'La contraseña es demasiado corta.'],
  [/unable to validate email|invalid email/i, 'El correo no es válido.'],
  [/rate limit|too many requests/i, 'Demasiados intentos. Espera un momento y vuelve a probar.'],
  [/schema cache|could not find the table|relation .* does not exist/i, 'La base de datos no está actualizada: falta ejecutar una migración en Supabase.'],
  [/only caregivers can add a person/i, 'Solo los cuidadores pueden añadir personas.'],
  [/only this person's caregivers can create an invite/i, 'Solo los cuidadores de esta persona pueden crear invitaciones.'],
  [/not valid or has expired/i, 'Este código no es válido o ha caducado.'],
  [/no profile for this user/i, 'No se ha encontrado tu perfil.'],
  [/network request failed|failed to fetch|network/i, 'Sin conexión. Revisa tu conexión a internet.'],
  [/row-level security|permission denied/i, 'No tienes permiso para hacer esto.'],
  [/violates check constraint/i, 'Algún valor está fuera del rango permitido.'],
];

export function translateError(message: string) {
  return ERRORS.find(([re]) => re.test(message))?.[1] ?? message;
}

export const errorText = (e: unknown) => translateError(e instanceof Error ? e.message : String(e));
