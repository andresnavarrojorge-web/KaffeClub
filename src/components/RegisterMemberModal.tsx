import React, { useState, useEffect } from 'react';
import { X, RefreshCw, UserPlus } from 'lucide-react';
import {
  DATE_REGEX,
  MEMBER_CODE_REGEX,
  MemberRecord,
  PHONE_REGEX,
  generateUniqueMemberCode,
} from '../utils/membership';
import { PhotoCapture } from './PhotoCapture';

interface RegisterMemberModalProps {
  isOpen: boolean;
  editingMember: MemberRecord | null;
  existingCodes: Set<string>;
  onClose: () => void;
  onSaveMember: (data: {
    memberCode: string;
    name: string;
    birthDate: string;
    phone: string;
    photoData: string;
  }) => Promise<void>;
}

export const RegisterMemberModal: React.FC<RegisterMemberModalProps> = ({
  isOpen,
  editingMember,
  existingCodes,
  onClose,
  onSaveMember,
}) => {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [memberCode, setMemberCode] = useState('');
  const [photoData, setPhotoData] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      if (editingMember) {
        setName(editingMember.name);
        setBirthDate(editingMember.birthDate);
        setPhone(editingMember.phone);
        setMemberCode(editingMember.memberCode);
        setPhotoData(editingMember.photoData || '');
      } else {
        setName('');
        setBirthDate('1996-05-15');
        setPhone('+57 300 ');
        setMemberCode(generateUniqueMemberCode(existingCodes));
        setPhotoData('');
      }
    }
  }, [isOpen, editingMember, existingCodes]);

  if (!isOpen) return null;

  const handleRegenerateCode = () => {
    if (editingMember) return;
    setMemberCode(generateUniqueMemberCode(existingCodes));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedBirth = birthDate.trim();
    const trimmedCode = memberCode.trim().toUpperCase();

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      setErrorMsg('El nombre debe tener entre 2 y 100 caracteres.');
      return;
    }
    if (!DATE_REGEX.test(trimmedBirth)) {
      setErrorMsg('Selecciona una fecha de cumpleaños válida (YYYY-MM-DD).');
      return;
    }
    if (
      trimmedPhone.length < 5 ||
      trimmedPhone.length > 25 ||
      !PHONE_REGEX.test(trimmedPhone)
    ) {
      setErrorMsg(
        'Ingresa un número de teléfono válido (entre 5 y 25 dígitos, ej. +57 300 123 4567).'
      );
      return;
    }
    if (
      trimmedCode.length < 4 ||
      trimmedCode.length > 32 ||
      !MEMBER_CODE_REGEX.test(trimmedCode)
    ) {
      setErrorMsg('El ID del miembro solo puede contener letras mayúsculas, números y guiones.');
      return;
    }
    if (!editingMember && existingCodes.has(trimmedCode)) {
      setErrorMsg('Este ID de miembro ya existe en la base de datos. Genera uno nuevo.');
      return;
    }

    setSubmitting(true);
    try {
      await onSaveMember({
        memberCode: trimmedCode,
        name: trimmedName,
        birthDate: trimmedBirth,
        phone: trimmedPhone,
        photoData,
      });
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo guardar el miembro.'
      );
    } finally {
      setSubmitting(false);
    }
  };

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
            <p className="text-xs text-zinc-500">Base de Datos de Membresías</p>
            <h2 className="text-lg font-semibold text-zinc-900 mt-0.5">
              {editingMember ? 'Editar Datos del Miembro' : 'Registrar Nuevo Miembro'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Cerrar formulario"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-zinc-500 block">
                ID Único del Miembro en Plataforma
              </span>
              <span className="text-base font-mono font-semibold text-zinc-900 tracking-tight mt-0.5 block">
                {memberCode}
              </span>
            </div>
            {!editingMember && (
              <button
                type="button"
                onClick={handleRegenerateCode}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-md transition-colors cursor-pointer"
                title="Generar otro ID único"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Nuevo ID</span>
              </button>
            )}
          </div>

          <div>
            <span className="block text-xs font-medium text-zinc-700 mb-1.5">
              Foto del miembro (opcional)
            </span>
            <PhotoCapture
              photo={photoData}
              onPhoto={(dataUrl) => setPhotoData(dataUrl)}
              hint="Toma la foto aquí mismo o adjunta una desde la galería."
            />
          </div>

          <div>
            <label
              htmlFor="member-name"
              className="block text-xs font-medium text-zinc-700 mb-1.5"
            >
              Nombre completo
            </label>
            <input
              id="member-name"
              type="text"
              required
              maxLength={100}
              placeholder="Ej. Valentina Morales"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="member-birthdate"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Fecha de cumpleaños
              </label>
              <input
                id="member-birthdate"
                type="date"
                required
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-900 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="member-phone"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Número de teléfono
              </label>
              <input
                id="member-phone"
                type="tel"
                required
                maxLength={25}
                placeholder="+57 300 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>
                {submitting
                  ? 'Guardando...'
                  : editingMember
                  ? 'Guardar Cambios'
                  : 'Crear Membresía'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};