import React, { useState } from 'react';
import { X, Copy, Check, Coffee, Phone, Calendar, Hash } from 'lucide-react';
import {
  MemberRecord,
  getDaysWithoutClaim,
  hasClaimedToday,
  isBirthdayTodayOrMonth,
} from '../utils/membership';

interface MemberCardModalProps {
  member: MemberRecord | null;
  todayStr: string;
  onClose: () => void;
  onClaimToday: (member: MemberRecord) => void;
  onOpenReminder: (member: MemberRecord) => void;
}

export const MemberCardModal: React.FC<MemberCardModalProps> = ({
  member,
  todayStr,
  onClose,
  onClaimToday,
  onOpenReminder,
}) => {
  const [copied, setCopied] = useState(false);

  if (!member) return null;

  const claimedToday = hasClaimedToday(member, todayStr);
  const daysWithout = getDaysWithoutClaim(member, todayStr);
  const birthdayInfo = isBirthdayTodayOrMonth(member.birthDate, todayStr);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(member.memberCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-zinc-200 rounded-xl max-w-md w-full p-6 shadow-sm"
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
            <div>
              <p className="text-xs text-zinc-400">KaffeClub · Bono Diario</p>
              <p className="text-base font-semibold tracking-tight mt-0.5">{member.name}</p>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
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

          <div className="mt-5 bg-white rounded-lg px-4 py-3 flex flex-col items-center">
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

        <div className="space-y-2.5 text-xs text-zinc-600 mb-6">
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
        </div>

        <div className="flex items-center justify-end gap-3">
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