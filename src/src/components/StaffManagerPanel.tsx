import React, { useState } from 'react';
import {
  Copy,
  Check,
  UserPlus,
  ShieldCheck,
  Smartphone,
  MessageSquare,
  UserX,
  UserCheck,
  Trash2,
} from 'lucide-react';
import {
  OWNER_EMAIL,
  SHARED_APP_URL,
  StaffInviteRecord,
} from '../utils/membership';

interface StaffManagerPanelProps {
  isAdmin: boolean;
  staffInvites: StaffInviteRecord[];
  onAddStaff: (data: {
    email: string;
    name: string;
    role: 'employee' | 'manager';
  }) => Promise<void>;
  onToggleStaffStatus: (invite: StaffInviteRecord) => Promise<void>;
  onDeleteStaffInvite: (invite: StaffInviteRecord) => Promise<void>;
}

export const StaffManagerPanel: React.FC<StaffManagerPanelProps> = ({
  isAdmin,
  staffInvites,
  onAddStaff,
  onToggleStaffStatus,
  onDeleteStaffInvite,
}) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'employee' | 'manager'>('employee');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const activeStaffCount = staffInvites.filter((s) => s.status === 'active').length;

  const handleCopyShareLink = async () => {
    await navigator.clipboard.writeText(SHARED_APP_URL);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const whatsappShareText = `¡Hola equipo! Aquí está el enlace oficial de KaffeClub para gestionar las membresías y el Café del Día desde el teléfono: ${SHARED_APP_URL} (Inicia sesión con tu correo de Google autorizado).`;
  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(whatsappShareText)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
      setErrorMsg('Ingresa un correo electrónico válido (ej. empleado@gmail.com).');
      return;
    }
    if (cleanEmail === OWNER_EMAIL) {
      setErrorMsg('Tu correo de propietario ya tiene acceso total de administrador.');
      return;
    }
    if (cleanName.length < 2) {
      setErrorMsg('Ingresa el nombre del empleado (mínimo 2 caracteres).');
      return;
    }
    if (activeStaffCount >= 9) {
      setErrorMsg('Has alcanzado el límite de 9 empleados activos simultáneos en el plan actual.');
      return;
    }

    setSubmitting(true);
    try {
      await onAddStaff({ email: cleanEmail, name: cleanName, role });
      setEmail('');
      setName('');
      setRole('employee');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo autorizar el correo del empleado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="bg-white border border-zinc-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-emerald-800 font-medium">
              <Smartphone className="w-4 h-4" />
              <span>Enlace Móvil para Empleados · Sincronización en Tiempo Real</span>
            </div>
            <h2 className="text-lg font-semibold text-zinc-900 mt-1">
              Comparte la aplicación con tus empleados
            </h2>
            <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
              Envía este enlace a tus empleados para que lo abran en sus teléfonos. Por seguridad, <strong>únicamente los correos que autorices abajo</strong> (y tu cuenta de propietario <span className="font-mono">{OWNER_EMAIL}</span>) podrán entrar a registrar membresías y ver los datos de los clientes.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Enlace Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar Enlace de la App</span>
                </>
              )}
            </button>

            <a
              href={whatsappShareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Enviar por WhatsApp</span>
            </a>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <span className="text-zinc-500">URL directa para teléfonos y barra:</span>
          <code className="font-mono text-zinc-900 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-md select-all break-all">
            {SHARED_APP_URL}
          </code>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {isAdmin && (
          <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6">
            <div className="pb-4 border-b border-zinc-200">
              <h3 className="text-base font-semibold text-zinc-900">
                Autorizar Correo de Empleado
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Agrega el correo de Google con el que tu empleado iniciará sesión en su teléfono.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="staff-name"
                  className="block text-xs font-medium text-zinc-700 mb-1.5"
                >
                  Nombre del empleado
                </label>
                <input
                  id="staff-name"
                  type="text"
                  required
                  maxLength={80}
                  placeholder="Ej. Carlos Gómez (Barista)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="staff-email"
                  className="block text-xs font-medium text-zinc-700 mb-1.5"
                >
                  Correo electrónico (Google)
                </label>
                <input
                  id="staff-email"
                  type="email"
                  required
                  maxLength={120}
                  placeholder="ejemplo@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="staff-role"
                  className="block text-xs font-medium text-zinc-700 mb-1.5"
                >
                  Función en la cafetería
                </label>
                <select
                  id="staff-role"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value === 'manager' ? 'manager' : 'employee')
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
                >
                  <option value="employee">
                    Empleado en Barra (Registrar socios, entregar café y recordatorios)
                  </option>
                  <option value="manager">
                    Encargado de Turno (Acceso completo sin borrar registros)
                  </option>
                </select>
              </div>

              {errorMsg && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Autorizando y sincronizando...'
                    : 'Autorizar Acceso al Empleado'}
                </span>
              </button>
            </form>
          </div>
        )}

        <div
          className={`${
            isAdmin ? 'lg:col-span-7' : 'lg:col-span-12'
          } bg-white border border-zinc-200 rounded-xl overflow-hidden`}
        >
          <div className="p-6 border-b border-zinc-200 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Personal con Acceso Autorizado
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Solo estas cuentas pueden ver la base de datos de miembros y registrar reclamos diarios. Ningún empleado puede eliminar miembros.
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
          </div>

          <div className="divide-y divide-zinc-200 text-xs">
            <div className="p-4 flex items-center justify-between gap-4 bg-zinc-50/60">
              <div>
                <div className="font-semibold text-zinc-900">
                  Propietario / Administrador Principal
                </div>
                <div className="font-mono text-zinc-600 mt-0.5">{OWNER_EMAIL}</div>
              </div>
              <span className="text-emerald-800 font-medium whitespace-nowrap">
                Control Total · Activo
              </span>
            </div>

            {staffInvites.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                Aún no has agregado correos de empleados. Usa el formulario para autorizar a tu equipo.
              </div>
            ) : (
              staffInvites.map((invite) => {
                const isActive = invite.status === 'active';
                return (
                  <div
                    key={invite.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 text-sm">
                          {invite.name}
                        </span>
                        <span aria-hidden="true" className="text-zinc-300">
                          ·
                        </span>
                        <span className="text-zinc-500">
                          {invite.role === 'manager' ? 'Encargado' : 'Empleado'}
                        </span>
                      </div>
                      <div className="font-mono text-zinc-600 mt-0.5">
                        {invite.email}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-medium mr-2 ${
                          isActive ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {isActive ? 'Autorizado' : 'Acceso Revocado'}
                      </span>

                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => onToggleStaffStatus(invite)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors cursor-pointer"
                          >
                            {isActive ? (
                              <>
                                <UserX className="w-3.5 h-3.5 text-amber-800" />
                                <span>Suspender</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Reactivar</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteStaffInvite(invite)}
                            className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Eliminar autorización"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};