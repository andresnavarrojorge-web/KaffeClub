import { Timestamp } from 'firebase/firestore';

export const OWNER_EMAIL = 'jtolosa@unicesar.edu.co';
export const SHARED_APP_URL = window.location.origin;

export interface StaffInviteRecord {
  id: string;
  email: string;
  name: string;
  role: 'employee' | 'manager';
  status: 'active' | 'revoked';
  teamEmails: string[];
  createdByUid: string;
  updatedByUid: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface MemberRecord {
  id: string;
  memberCode: string;
  name: string;
  birthDate: string;
  phone: string;
  totalClaims: number;
  lastClaimDate: string;
  lastReminderSentDate: string;
  status: 'active' | 'archived';
  staffEmails: string[];
  createdByUid: string;
  updatedByUid: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  /** Foto del miembro, comprimida (data URL JPEG). */
  photoData?: string;
  /** Vencimiento de la membresía, formato YYYY-MM-DD. */
  membershipExpiryDate?: string;
  /** Fecha en que se abrió el saludo de cumpleaños por WhatsApp. */
  lastBirthdayMessageDate?: string;
  /** Fecha en que se abrió el aviso de vencimiento por WhatsApp. */
  lastExpiryNoticeDate?: string;
}

export interface CoffeeClaimRecord {
  id: string;
  memberId: string;
  memberCode: string;
  memberName: string;
  claimDate: string;
  coffeeType: string;
  servedBy: string;
  staffEmails: string[];
  createdByUid: string;
  createdAt: Timestamp | null;
}

export const MEMBER_CODE_REGEX = /^[A-Z0-9\-]+$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const PHONE_REGEX = /^[0-9+\-\s()]+$/;

export const COFFEE_VARIETIES = [
  'Americano del Día (Origen)',
  'Espresso Doble',
  'Filtrado V60',
  'Cappuccino Artesanal',
  'Latte de la Casa',
  'Cold Brew 18h',
] as const;

export function emailToInviteId(email: string): string {
  const sanitized = email
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100);
  return `inv_${sanitized || 'user'}`;
}

export function getTodayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getOffsetDateString(daysAgo: number, baseDate: Date = new Date()): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - daysAgo);
  return getTodayDateString(d);
}

export function parseLocalDate(dateStr: string): Date | null {
  if (!DATE_REGEX.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function diffDaysBetweenDates(startDateStr: string, endDateStr: string): number {
  const start = parseLocalDate(startDateStr);
  const end = parseLocalDate(endDateStr);
  if (!start || !end) return 0;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay));
}

export function getDaysWithoutClaim(member: MemberRecord, todayStr: string): number {
  if (member.lastClaimDate && DATE_REGEX.test(member.lastClaimDate)) {
    return diffDaysBetweenDates(member.lastClaimDate, todayStr);
  }
  if (member.createdAt && typeof member.createdAt.toDate === 'function') {
    const createdDateStr = getTodayDateString(member.createdAt.toDate());
    return diffDaysBetweenDates(createdDateStr, todayStr);
  }
  return 0;
}

export function hasClaimedToday(member: MemberRecord, todayStr: string): boolean {
  return member.lastClaimDate === todayStr;
}

export function isInactiveForFiveDays(member: MemberRecord, todayStr: string): boolean {
  if (member.status !== 'active') return false;
  const days = getDaysWithoutClaim(member, todayStr);
  return days >= 5;
}

export function isBirthdayTodayOrMonth(birthDateStr: string, todayStr: string): {
  isToday: boolean;
  isThisMonth: boolean;
  formattedBirthday: string;
} {
  if (!DATE_REGEX.test(birthDateStr) || !DATE_REGEX.test(todayStr)) {
    return { isToday: false, isThisMonth: false, formattedBirthday: birthDateStr };
  }
  const [, bMonth, bDay] = birthDateStr.split('-');
  const [, tMonth, tDay] = todayStr.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthLabel = months[Math.max(0, Math.min(11, Number(bMonth) - 1))];
  return {
    isToday: bMonth === tMonth && bDay === tDay,
    isThisMonth: bMonth === tMonth,
    formattedBirthday: `${bDay} ${monthLabel}`,
  };
}

export function generateUniqueMemberCode(existingCodes: Set<string>): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 100; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidate = `KAF-${suffix}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
  }
  return `KAF-${Date.now().toString().slice(-4)}`;
}

export function buildReminderMessage(member: MemberRecord, daysInactive: number): string {
  const firstName = member.name.trim().split(' ')[0] || member.name;
  const lastVisitPart = member.lastClaimDate
    ? `Notamos que llevas ${daysInactive} días sin pasar por tu Café del Día gratis.`
    : `Notamos que aún no has estrenado tu beneficio diario de Café del Día desde que te registraste hace ${daysInactive} días.`;

  return `¡Hola ${firstName}! Te escribimos de KaffeClub. ${lastVisitPart} Recuerda que con tu ID de socio (${member.memberCode}) tienes 1 café de cortesía todos los días. ¡Pasa hoy por la barra, te esperamos!`;
}

export function sanitizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  return digits;
}

// ---------------------------------------------------------------------------
// Membresía de 6 meses, avisos y mensajes de WhatsApp
// ---------------------------------------------------------------------------

export const MEMBERSHIP_MONTHS = 6;
export const EXPIRY_WARNING_DAYS = 15;

export function addMonthsToDateString(dateStr: string, months: number): string {
  const base = parseLocalDate(dateStr);
  if (!base) return dateStr;
  const day = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return getTodayDateString(target);
}

/** Vencimiento guardado; si el miembro es anterior a esta función, se calcula desde su registro. */
export function getMembershipExpiryDate(member: MemberRecord): string {
  if (member.membershipExpiryDate && DATE_REGEX.test(member.membershipExpiryDate)) {
    return member.membershipExpiryDate;
  }
  if (member.createdAt && typeof member.createdAt.toDate === 'function') {
    return addMonthsToDateString(
      getTodayDateString(member.createdAt.toDate()),
      MEMBERSHIP_MONTHS
    );
  }
  return '';
}

export type MembershipState = 'active' | 'expiring' | 'expired' | 'unknown';

export interface MembershipStatus {
  state: MembershipState;
  expiryDate: string;
  /** Días que faltan (negativo si ya venció). */
  daysLeft: number;
}

export function getMembershipStatus(member: MemberRecord, todayStr: string): MembershipStatus {
  const expiryDate = getMembershipExpiryDate(member);
  const today = parseLocalDate(todayStr);
  const expiry = parseLocalDate(expiryDate);
  if (!today || !expiry) return { state: 'unknown', expiryDate, daysLeft: 0 };
  const daysLeft = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  let state: MembershipState = 'active';
  if (daysLeft < 0) state = 'expired';
  else if (daysLeft <= EXPIRY_WARNING_DAYS) state = 'expiring';
  return { state, expiryDate, daysLeft };
}

/** Al renovar se suman 6 meses al vencimiento actual (o a hoy si ya venció). */
export function getRenewedExpiryDate(member: MemberRecord, todayStr: string): string {
  const current = getMembershipExpiryDate(member);
  const base = current && current >= todayStr ? current : todayStr;
  return addMonthsToDateString(base, MEMBERSHIP_MONTHS);
}

function firstNameOf(name: string): string {
  return name.trim().split(' ')[0] || name;
}

export function buildWhatsAppLink(phone: string, text: string): string {
  return `https://wa.me/${sanitizePhoneForWhatsApp(phone)}?text=${encodeURIComponent(text)}`;
}

export function buildBirthdayMessage(member: MemberRecord): string {
  return `¡Feliz cumpleaños, ${firstNameOf(member.name)}! 🎂 Todo el equipo de KaffeClub te desea un día increíble. Pasa hoy por la barra y celebra con nosotros: tu café del día te espera ☕`;
}

export function buildExpiryMessage(member: MemberRecord, status: MembershipStatus): string {
  const first = firstNameOf(member.name);
  if (status.state === 'expired') {
    return `¡Hola ${first}! Te escribimos de KaffeClub. Tu membresía (ID ${member.memberCode}) venció el ${status.expiryDate}. Si quieres seguir disfrutando tu café diario, pasa por la barra y la renovamos por ${MEMBERSHIP_MONTHS} meses más. ¡Te esperamos!`;
  }
  const when =
    status.daysLeft === 0
      ? 'vence hoy'
      : `vence el ${status.expiryDate} (en ${status.daysLeft} ${status.daysLeft === 1 ? 'día' : 'días'})`;
  return `¡Hola ${first}! Te escribimos de KaffeClub. Tu membresía (ID ${member.memberCode}) ${when}. Pasa por la barra cuando quieras y la renovamos por ${MEMBERSHIP_MONTHS} meses más para que no pierdas tu café diario.`;
}

export function buildCredentialMessage(member: MemberRecord, expiryDate: string): string {
  const until = expiryDate ? ` Tu membresía está vigente hasta el ${expiryDate}.` : '';
  return `¡Hola ${firstNameOf(member.name)}! Esta es tu credencial de KaffeClub. Tu ID de socio es ${member.memberCode}.${until} Preséntala en la barra para reclamar tu café del día (1 por día).`;
}

export function buildAdminExpirySummary(
  rows: { name: string; memberCode: string; expiryDate: string; daysLeft: number }[]
): string {
  const lines = rows.map((r) => {
    const when =
      r.daysLeft < 0
        ? `venció el ${r.expiryDate} (hace ${Math.abs(r.daysLeft)} d)`
        : `vence el ${r.expiryDate} (en ${r.daysLeft} d)`;
    return `• ${r.name} (${r.memberCode}) ${when}`;
  });
  return `KaffeClub · Membresías por atender (${rows.length}):\n${lines.join('\n')}`;
}
