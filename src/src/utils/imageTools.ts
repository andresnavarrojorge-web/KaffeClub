// Utilidades para fotos de miembros: se recortan en cuadrado y se comprimen
// para guardarlas directamente en el documento del miembro en Firestore
// (unos 15-30 KB por foto, sin necesidad de Firebase Storage).

const PHOTO_SIZE = 320;
const PHOTO_QUALITY = 0.72;

function drawSquare(source: CanvasImageSource, sourceW: number, sourceH: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  const side = Math.min(sourceW, sourceH);
  const sx = (sourceW - side) / 2;
  const sy = (sourceH - side) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  ctx.drawImage(source, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

export function fileToPhotoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        resolve(drawSquare(img, img.naturalWidth, img.naturalHeight));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}

export function videoFrameToPhotoDataUrl(video: HTMLVideoElement): string {
  return drawSquare(video, video.videoWidth, video.videoHeight);
}
