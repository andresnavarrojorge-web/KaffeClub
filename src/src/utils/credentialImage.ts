import { MemberRecord } from './membership';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la foto.'));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja la credencial como imagen PNG lista para compartir por WhatsApp. */
export async function buildCredentialImage(
  member: MemberRecord,
  expiryDate: string
): Promise<Blob> {
  const W = 1000;
  const H = 620;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear la imagen de la credencial.');

  const sans = '"Plus Jakarta Sans", system-ui, sans-serif';
  const mono = '"JetBrains Mono", ui-monospace, monospace';

  // Fondo
  ctx.fillStyle = '#faf9f6';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#18181b';
  roundRect(ctx, 30, 30, W - 60, H - 60, 28);
  ctx.fill();

  // Encabezado
  ctx.fillStyle = '#a1a1aa';
  ctx.font = `500 26px ${sans}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('KaffeClub · Bono Diario', 80, 100);

  // Foto o iniciales
  const px = 80;
  const py = 135;
  const size = 230;
  ctx.save();
  roundRect(ctx, px, py, size, size, 24);
  ctx.clip();
  if (member.photoData) {
    try {
      const img = await loadImage(member.photoData);
      ctx.drawImage(img, px, py, size, size);
    } catch {
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(px, py, size, size);
    }
  } else {
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(px, py, size, size);
    const initials = member.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
    ctx.fillStyle = '#fcd34d';
    ctx.font = `700 96px ${sans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials || 'K', px + size / 2, py + size / 2 + 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // Datos
  const tx = 345;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 46px ${sans}`;
  const name = member.name.length > 24 ? `${member.name.slice(0, 23)}…` : member.name;
  ctx.fillText(name, tx, 190);

  ctx.fillStyle = '#fcd34d';
  ctx.font = `600 40px ${mono}`;
  ctx.fillText(member.memberCode, tx, 250);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = `500 24px ${sans}`;
  ctx.fillText('Membresía vigente hasta', tx, 315);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 34px ${mono}`;
  ctx.fillText(expiryDate || 'Por definir', tx, 360);

  // Código de barras decorativo (mismo patrón que la credencial en pantalla)
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 80, 405, W - 160, 140, 18);
  ctx.fill();
  ctx.fillStyle = '#18181b';
  const bars = member.memberCode.split('').flatMap((ch, idx) => {
    const code = ch.charCodeAt(0);
    return [(code % 3) + 1, ((code >> 2) % 2) + 1, ((code + idx) % 3) + 1];
  });
  let x = 120;
  const barTop = 425;
  const barH = 80;
  bars.forEach((w, idx) => {
    const width = w * 4;
    if (x + width < W - 120) ctx.fillRect(x, barTop, width, barH);
    x += width + (idx % 2 === 0 ? 4 : 2);
  });
  ctx.fillStyle = '#27272a';
  ctx.font = `600 22px ${mono}`;
  ctx.textAlign = 'center';
  ctx.fillText(member.memberCode, W / 2, 532);
  ctx.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))),
      'image/png'
    );
  });
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * En el celular abre el menú de compartir con la imagen (el usuario elige WhatsApp
 * y el contacto). Si el navegador no puede compartir archivos, descarga la imagen.
 */
export async function shareCredentialImage(
  member: MemberRecord,
  expiryDate: string,
  message: string
): Promise<ShareResult> {
  const blob = await buildCredentialImage(member, expiryDate);
  const fileName = `credencial-${member.memberCode}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: message, title: 'Credencial KaffeClub' });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
