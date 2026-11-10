import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Coffee,
  Phone,
  Calendar,
  CalendarClock,
  CalendarPlus,
  Hash,
  MessageSquare,
  Share2,
} from 'lucide-react';
import {
  MEMBERSHIP_MONTHS,
  MemberRecord,
  buildCredentialMessage,
  buildWhatsAppLink,
  getDaysWithoutClaim,
  getMembershipStatus,
  hasClaimedToday,
  isBirthdayTodayOrMonth,
} from '../utils/membership';
import { shareCredentialImage } from '../utils/credentialImage';
import { PhotoCapture } from './PhotoCapture';

interface MemberCardModalProps {
  member: MemberRecord | null;
  todayStr: string;
  onClose: () => void;
  onClaimToday: (member: MemberRecord) => void;
  onOpenReminder: (member: MemberRecord) => void;
  onSavePhoto: (member: MemberRecord, photoData: string) => Promise<void>;
  onRenew: (member: MemberRecord) => Promise<void>;
}

export const MemberCardModal: React.FC<MemberCardModalProps> = ({
  member,
  todayStr,
  onClose,
  onClaimToday,
  onOpenReminder,
  onSavePhoto,
  onRenew,
}) => {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [shareNote, setShareNote] = useState('');

  if (!member) return null;

  const claimedToday = hasClaimedToday(member, todayStr);
  const daysWithout = getDaysWithoutClaim(member, todayStr);
  const birthdayInfo = isBirthdayTodayOrMonth(member.birthDate, todayStr);
  const membership = getMembershipStatus(member, todayStr);
  const credentialMessage = buildCredentialMessage(member, membership.expiryDate);
  const whatsappHref = buildWhatsAppLink(member.phone, credentialMessage);
  const initials =
    member.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || 'K';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(member.memberCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleShareImage = async () => {
    setSharing(true);
    setShareNote('');
    try {
      const result = await shareCredentialImage(member, membership.expiryDate, credentialMessage);
      if (result === 'downloaded') {
        setShareNote(
          'Tu navegador no puede compartir imágenes directo. Se descargó la credencial: adjúntala en el chat de WhatsApp.'
        );
      }
    } catch (err) {
      setShareNote(err instanceof Error ? err.message : 'No se pudo preparar la credencial.');
    } finally {
      setSharing(false);
    }
  };

  const handleRenew = async () => {
    setRenewing(true);
    try {
      await onRenew(member);
    } finally {
      setRenewing(false);
    }
  };

  const bars = member.memberCode
    .split('')
    .flatMap((ch, idx) => {
      const code = ch.charCodeAt(0);
      return [
        (code % 3) + 1,
        ((code >> 2) % 2) + 1,
        ((code + idx) % 3) + 1,
      ];
    });

  const membershipBadge =
    membership.state === 'expired'
      ? 'bg-red-50 text-red-700 border-red-200'
      : membership.state === 'expiring'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';
  const membershipLabel =
    membership.state === 'expired'
      ? `Vencida hace ${Math.abs(membership.daysLeft)} ${Math.abs(membership.daysLeft) === 1 ? 'día' : 'días'}`
      : membership.state === 'expiring'
      ? membership.daysLeft === 0
        ? 'Vence hoy'
        : `Vence en ${membership.daysLeft} ${membership.daysLeft === 1 ? 'día' : 'días'}`
      : membership.state === 'active'
      ? 'Vigente'
      : 'Sin fecha';

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-zinc-200 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-6 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <div>
            <p className="text-xs text-zinc-500">Credencial de Membresía</p>
            <h2 className="text-lg font-semibold text-zinc-900">{member.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Cerrar credencial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-5 bg-zinc-900 text-white rounded-xl p-5">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0 flex items-center justify-center text-base font-semibold text-amber-300">
                {member.photoData ? (
                  <img
                    src={member.photoData}
                    alt={`Foto de ${member.name}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-zinc-400">KaffeClub · Bono Diario</p>
                <p className="text-base font-semibold tracking-tight mt-0.5 truncate">
                  {member.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-300 hover:text-amber-200 transition-colors cursor-pointer shrink-0"
              title="Copiar ID del miembro"
            >
              <span>{member.memberCode}</span>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-zinc-800 text-xs">
            <div>
              <span className="text-zinc-400 block">Cafés reclamados</span>
              <span className="font-mono tabular-nums text-sm font-semibold text-white mt-0.5 block">
                {member.totalClaims}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block">Último reclamo</span>
              <span className="font-mono tabular-nums text-sm font-semibold text-white mt-0.5 block">
                {member.lastClaimDate || 'Sin reclamos'}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block">Inactividad</span>
              <span className="font-mono tabular-nums text-sm font-semibold text-white mt-0.5 block">
                {daysWithout} {daysWithout === 1 ? 'día' : 'días'}
              </span>
            </div>
          </div>

          <div className="mt-4 text-xs text-zinc-400">
            Vigente hasta{' '}
            <span className="font-mono tabular-nums text-white">
              {membership.expiryDate || 'por definir'}
            </span>
          </div>

          <div className="mt-4 bg-white rounded-lg px-4 py-3 flex flex-col items-center">
            <div className="flex items-center justify-center gap-[2px] h-10 w-full overflow-hidden">
              {bars.map((w, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-900 h-full"
                  style={{ width: `${w * 2}px`, marginRight: idx % 2 === 0 ? '2px' : '1px' }}
                />
              ))}
            </div>
            <span className="mt-1.5 text-[11px] font-mono tracking-widest text-zinc-800">
              {member.memberCode}
            </span>
          </div>
        </div>

        <div className="space-y-2.5 text-xs text-zinc-600 mb-5">
          <div className="flex items-center justify-between py-1.5 border-b border-zinc-100">
            <span className="inline-flex items-center gap-2 text-zinc-500">
              <Hash className="w-3.5 h-3.5" />
              <span>ID Único en Plataforma</span>
            </span>
            <span className="font-mono tabular-nums font-medium text-zinc-900">
              {member.memberCode}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-zinc-100">
            <span className="inline-flex items-center gap-2 text-zinc-500">
              <Phone className="w-3.5 h-3.5" />
              <span>Teléfono de contacto</span>
            </span>
            <span className="font-mono tabular-nums font-medium text-zinc-900">
              {member.phone}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-zinc-100">
            <span className="inline-flex items-center gap-2 text-zinc-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>Fecha de cumpleaños</span>
            </span>
            <span className="font-mono tabular-nums font-medium text-zinc-900">
              {member.birthDate} ({birthdayInfo.formattedBirthday})
              {birthdayInfo.isToday ? ' · Cumpleaños hoy' : ''}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-100">
            <span className="inline-flex items-center gap-2 text-zinc-500">
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Membresía ({MEMBERSHIP_MONTHS} meses)</span>
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${membershipBadge}`}
            >
              {membershipLabel}
            </span>
          </div>
        </div>

        {(membership.state === 'expired' || membership.state === 'expiring') && (
          <button
            type="button"
            disabled={renewing}
            onClick={handleRenew}
            className="w-full mb-5 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>{renewing ? 'Renovando...' : `Renovar ${MEMBERSHIP_MONTHS} meses`}</span>
          </button>
        )}

        <div className="mb-5 pt-4 border-t border-zinc-200">
          <p className="text-xs font-medium text-zinc-700 mb-2.5">Foto de la credencial</p>
          <PhotoCapture
            photo={member.photoData || ''}
            onPhoto={(dataUrl) => onSavePhoto(member, dataUrl)}
            hint="La foto se guarda sola al tomarla o adjuntarla."
          />
        </div>

        <div className="mb-6 pt-4 border-t border-zinc-200">
          <p className="text-xs font-medium text-zinc-700 mb-2.5">Enviar al WhatsApp del miembro</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sharing}
              onClick={handleShareImage}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{sharing ? 'Preparando...' : 'Compartir credencial (imagen)'}</span>
            </button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Enviar datos por chat</span>
            </a>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            La imagen se comparte desde el menú del teléfono: elige WhatsApp y el contacto. «Enviar
            datos por chat» abre directo el chat del miembro con el ID y la vigencia.
          </p>
          {shareNote && (
            <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {shareNote}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {daysWithout >= 5 && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenReminder(member);
              }}
              className="px-4 py-2 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Enviar Recordatorio (+5d)
            </button>
          )}
          <button
            type="button"
            disabled={claimedToday}
            onClick={() => {
              onClose();
              onClaimToday(member);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              claimedToday
                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                : 'bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer'
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            <span>{claimedToday ? 'Café de hoy ya reclamado' : 'Entregar Café del Día'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
