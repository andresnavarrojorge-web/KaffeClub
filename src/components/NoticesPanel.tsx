import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  Cake,
  CalendarClock,
  CalendarPlus,
  Check,
  CreditCard,
  MessageSquare,
  Coffee,
  ShieldAlert,
} from 'lucide-react';
import { db } from '../firebase';
import {
  EXPIRY_WARNING_DAYS,
  MEMBERSHIP_MONTHS,
  MemberRecord,
  MembershipStatus,
  PHONE_REGEX,
  buildAdminExpirySummary,
  buildBirthdayMessage,
  buildExpiryMessage,
  buildReminderMessage,
  buildWhatsAppLink,
  getDaysWithoutClaim,
  getMembershipStatus,
  isBirthdayTodayOrMonth,
  isInactiveForFiveDays,
  sanitizePhoneForWhatsApp,
} from '../utils/membership';

interface NoticesPanelProps {
  /** Solo miembros activos. */
  members: MemberRecord[];
  todayStr: string;
  isAdmin: boolean;
  onUpdateMember: (member: MemberRecord, fields: Record<string, string>) => Promise<void>;
  onRenew: (member: MemberRecord) => Promise<void>;
  onOpenCard: (member: MemberRecord) => void;
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || 'K'
  );
}

const Avatar: React.FC<{ member: MemberRecord }> = ({ member }) => (
  <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0 flex items-center justify-center text-xs font-semibold text-zinc-600">
    {member.photoData ? (
      <img src={member.photoData} alt="" className="w-full h-full object-cover" />
    ) : (
      initialsOf(member.name)
    )}
  </div>
);

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  count: number;
  action?: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}> = ({ icon, title, description, count, action, empty, children }) => (
  <section className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
    <div className="p-6 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-zinc-500">{icon}</div>
        <div>
          <h2 className="text-base font-semibold text-zinc-900">
            {title} <span className="font-mono tabular-nums text-zinc-500">({count})</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
        </div>
      </div>
      {action}
    </div>
    {count === 0 ? (
      <p className="px-6 py-8 text-xs text-zinc-500 text-center">{empty}</p>
    ) : (
      <ul className="divide-y divide-zinc-100">{children}</ul>
    )}
  </section>
);

const Row: React.FC<{
  member: MemberRecord;
  detail: string;
  badge?: { label: string; tone: 'red' | 'amber' | 'green' };
  children: React.ReactNode;
}> = ({ member, detail, badge, children }) => {
  const tone =
    badge?.tone === 'red'
      ? 'bg-red-50 text-red-700 border-red-200'
      : badge?.tone === 'amber'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return (
    <li className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar member={member} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 truncate">{member.name}</span>
            <span className="text-[11px] font-mono text-zinc-500">{member.memberCode}</span>
            {badge && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${tone}`}
              >
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{detail}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>
    </li>
  );
};

const WhatsAppButton: React.FC<{ href: string; sentToday: boolean; onOpen: () => void }> = ({
  href,
  sentToday,
  onOpen,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    onClick={onOpen}
    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
      sentToday
        ? 'text-zinc-600 bg-white hover:bg-zinc-50 border-zinc-200'
        : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
    }`}
  >
    {sentToday ? <Check className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
    <span>{sentToday ? 'Abierto hoy · abrir de nuevo' : 'Enviar por WhatsApp'}</span>
  </a>
);

export const NoticesPanel: React.FC<NoticesPanelProps> = ({
  members,
  todayStr,
  isAdmin,
  onUpdateMember,
  onRenew,
  onOpenCard,
}) => {
  const [adminPhone, setAdminPhone] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneNote, setPhoneNote] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  // WhatsApp del administrador, compartido por todo el equipo.
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'app'),
      (snap) => {
        const value = String(snap.data()?.adminPhone || '');
        setAdminPhone(value);
        setPhoneDraft((prev) => prev || value);
      },
      (error) => console.error('No se pudo leer settings/app:', error)
    );
    return () => unsub();
  }, []);

  const birthdays = useMemo(
    () => members.filter((m) => isBirthdayTodayOrMonth(m.birthDate, todayStr).isToday),
    [members, todayStr]
  );

  const expiryRows = useMemo(
    () =>
      members
        .map((member) => ({ member, status: getMembershipStatus(member, todayStr) }))
        .filter((r) => r.status.state === 'expired' || r.status.state === 'expiring')
        .sort((a, b) => a.status.daysLeft - b.status.daysLeft),
    [members, todayStr]
  );

  const inactive = useMemo(
    () =>
      members
        .filter((m) => isInactiveForFiveDays(m, todayStr))
        .sort((a, b) => getDaysWithoutClaim(b, todayStr) - getDaysWithoutClaim(a, todayStr)),
    [members, todayStr]
  );

  const adminPhoneValid = sanitizePhoneForWhatsApp(adminPhone).length >= 10;
  const adminSummaryHref = adminPhoneValid
    ? buildWhatsAppLink(
        adminPhone,
        buildAdminExpirySummary(
          expiryRows.map((r) => ({
            name: r.member.name,
            memberCode: r.member.memberCode,
            expiryDate: r.status.expiryDate,
            daysLeft: r.status.daysLeft,
          }))
        )
      )
    : '';

  const handleSavePhone = async () => {
    const value = phoneDraft.trim();
    if (!PHONE_REGEX.test(value) || sanitizePhoneForWhatsApp(value).length < 10) {
      setPhoneNote('Escribe un número válido, por ejemplo +57 300 123 4567.');
      return;
    }
    setSavingPhone(true);
    setPhoneNote('');
    try {
      await setDoc(
        doc(db, 'settings', 'app'),
        { adminPhone: value, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setPhoneNote('WhatsApp del administrador guardado.');
    } catch (error) {
      console.error('No se pudo guardar settings/app:', error);
      setPhoneNote('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleRenew = async (member: MemberRecord) => {
    setRenewingId(member.id);
    try {
      await onRenew(member);
    } finally {
      setRenewingId(null);
    }
  };

  const badgeFor = (status: MembershipStatus) => {
    if (status.state === 'expired') {
      const d = Math.abs(status.daysLeft);
      return { label: `Vencida hace ${d} ${d === 1 ? 'día' : 'días'}`, tone: 'red' as const };
    }
    if (status.daysLeft === 0) return { label: 'Vence hoy', tone: 'amber' as const };
    return {
      label: `Vence en ${status.daysLeft} ${status.daysLeft === 1 ? 'día' : 'días'}`,
      tone: 'amber' as const,
    };
  };

  return (
    <div className="space-y-8">
      <Section
        icon={<CalendarClock className="w-5 h-5" />}
        title="Membresías vencidas y por vencer"
        description={`Cada membresía dura ${MEMBERSHIP_MONTHS} meses. Aquí aparecen las vencidas y las que vencen en los próximos ${EXPIRY_WARNING_DAYS} días.`}
        count={expiryRows.length}
        empty="No hay membresías vencidas ni por vencer."
        action={
          expiryRows.length > 0 ? (
            adminPhoneValid ? (
              <a
                href={adminSummaryHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Avisar al administrador</span>
              </a>
            ) : (
              <span className="text-[11px] text-zinc-500 max-w-[220px]">
                {isAdmin
                  ? 'Guarda tu WhatsApp abajo para poder recibir este resumen.'
                  : 'El administrador aún no configuró su WhatsApp.'}
              </span>
            )
          ) : undefined
        }
      >
        {expiryRows.map(({ member, status }) => (
          <Row
            key={member.id}
            member={member}
            badge={badgeFor(status)}
            detail={`Vencimiento: ${status.expiryDate} · Tel. ${member.phone}`}
          >
            <WhatsAppButton
              href={buildWhatsAppLink(member.phone, buildExpiryMessage(member, status))}
              sentToday={member.lastExpiryNoticeDate === todayStr}
              onOpen={() => void onUpdateMember(member, { lastExpiryNoticeDate: todayStr })}
            />
            <button
              type="button"
              disabled={renewingId === member.id}
              onClick={() => handleRenew(member)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              <span>{renewingId === member.id ? 'Renovando...' : `Renovar ${MEMBERSHIP_MONTHS} meses`}</span>
            </button>
          </Row>
        ))}
      </Section>

      <Section
        icon={<Cake className="w-5 h-5" />}
        title="Cumpleaños de hoy"
        description="Saludo listo para enviar por WhatsApp: solo toca el botón y pulsa enviar."
        count={birthdays.length}
        empty="Hoy no hay cumpleaños."
      >
        {birthdays.map((member) => (
          <Row
            key={member.id}
            member={member}
            badge={{ label: 'Cumple hoy', tone: 'green' }}
            detail={`Nació el ${member.birthDate} · Tel. ${member.phone}`}
          >
            <WhatsAppButton
              href={buildWhatsAppLink(member.phone, buildBirthdayMessage(member))}
              sentToday={member.lastBirthdayMessageDate === todayStr}
              onOpen={() => void onUpdateMember(member, { lastBirthdayMessageDate: todayStr })}
            />
          </Row>
        ))}
      </Section>

      <Section
        icon={<Coffee className="w-5 h-5" />}
        title="Sin reclamar su café (+5 días)"
        description="Personas que llevan 5 días o más sin pasar por su café del día."
        count={inactive.length}
        empty="Nadie lleva más de 5 días sin reclamar su café."
      >
        {inactive.map((member) => {
          const days = getDaysWithoutClaim(member, todayStr);
          return (
            <Row
              key={member.id}
              member={member}
              badge={{ label: `${days} días sin reclamar`, tone: 'amber' }}
              detail={`Último reclamo: ${member.lastClaimDate || 'ninguno'} · Tel. ${member.phone}`}
            >
              <WhatsAppButton
                href={buildWhatsAppLink(member.phone, buildReminderMessage(member, days))}
                sentToday={member.lastReminderSentDate === todayStr}
                onOpen={() => void onUpdateMember(member, { lastReminderSentDate: todayStr })}
              />
              <button
                type="button"
                onClick={() => onOpenCard(member)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Ver credencial</span>
              </button>
            </Row>
          );
        })}
      </Section>

      {isAdmin && (
        <section className="bg-white border border-zinc-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-zinc-900">WhatsApp del administrador</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Con este número, el botón «Avisar al administrador» arma el resumen de membresías
            vencidas y por vencer.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="tel"
              inputMode="tel"
              maxLength={25}
              placeholder="+57 300 123 4567"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
            <button
              type="button"
              disabled={savingPhone}
              onClick={handleSavePhone}
              className="px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {savingPhone ? 'Guardando...' : 'Guardar número'}
            </button>
          </div>
          {phoneNote && <p className="mt-2 text-xs text-zinc-600">{phoneNote}</p>}
        </section>
      )}
    </div>
  );
};
