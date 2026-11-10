import React, { useState, useEffect } from 'react';
import { X, Copy, Check, MessageSquare, Send } from 'lucide-react';
import {
  MemberRecord,
  buildReminderMessage,
  getDaysWithoutClaim,
  sanitizePhoneForWhatsApp,
} from '../utils/membership';

interface ReminderModalProps {
  member: MemberRecord | null;
  todayStr: string;
  onClose: () => void;
  onMarkReminderSent: (member: MemberRecord, messageText: string) => Promise<void>;
}

export const ReminderModal: React.FC<ReminderModalProps> = ({
  member,
  todayStr,
  onClose,
  onMarkReminderSent,
}) => {
  const [messageText, setMessageText] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      const days = getDaysWithoutClaim(member, todayStr);
      setMessageText(buildReminderMessage(member, days));
      setCopied(false);
    }
  }, [member, todayStr]);

  if (!member) return null;

  const daysWithout = getDaysWithoutClaim(member, todayStr);
  const cleanPhone = sanitizePhoneForWhatsApp(member.phone);
  const whatsappHref = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
  const smsHref = `sms:${member.phone.replace(/\s+/g, '')}?body=${encodeURIComponent(messageText)}`;

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmSent = async () => {
    setSaving(true);
    try {
      await onMarkReminderSent(member, messageText);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-zinc-200 rounded-xl max-w-lg w-full p-6 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <div>
            <p className="text-xs text-amber-700 font-medium">
              Alerta de Retención · {daysWithout} días sin reclamar café
            </p>
            <h2 className="text-lg font-semibold text-zinc-900 mt-0.5">
              Recordatorio para {member.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-4 text-xs text-zinc-600 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            ID: <strong className="font-mono text-zinc-900">{member.memberCode}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Teléfono: <strong className="font-mono text-zinc-900">{member.phone}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Último reclamo:{' '}
            <strong className="font-mono text-zinc-900">
              {member.lastClaimDate || 'Ninguno'}
            </strong>
          </span>
        </div>

        <div className="mb-4">
          <label
            htmlFor="reminder-message"
            className="block text-xs font-medium text-zinc-700 mb-1.5"
          >
            Mensaje personalizado para el miembro
          </label>
          <textarea
            id="reminder-message"
            rows={4}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Mensaje copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar texto</span>
                </>
              )}
            </button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Abrir WhatsApp</span>
            </a>
            <a
              href={smsHref}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>SMS</span>
            </a>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleConfirmSent}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{saving ? 'Registrando...' : 'Marcar como Enviado Hoy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};