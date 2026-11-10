import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCw, User, X } from 'lucide-react';
import { fileToPhotoDataUrl, videoFrameToPhotoDataUrl } from '../utils/imageTools';

interface PhotoCaptureProps {
  /** Foto actual (data URL) o cadena vacía. */
  photo: string;
  /** Se llama con la foto ya recortada y comprimida. */
  onPhoto: (dataUrl: string) => void | Promise<void>;
  /** Texto de ayuda bajo los botones. */
  hint?: string;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({ photo, onPhoto, hint }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  // Apaga la cámara si el componente se cierra con ella encendida.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Conecta el video en cuanto aparece en pantalla.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
  }, [cameraOn, facing]);

  const startCamera = async (mode: 'user' | 'environment') => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      // Navegador sin acceso a cámara en vivo: usa la cámara nativa del teléfono.
      cameraInputRef.current?.click();
      return;
    }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 960 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setFacing(mode);
      setCameraOn(true);
    } catch {
      setCameraOn(false);
      setError(
        'No se pudo abrir la cámara. Revisa el permiso del navegador o usa «Adjuntar foto» y elige la cámara del teléfono.'
      );
    }
  };

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = videoFrameToPhotoDataUrl(video);
      stopCamera();
      await onPhoto(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la foto.');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await onPhoto(await fileToPhotoDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la foto.');
    } finally {
      setBusy(false);
    }
  };

  const buttonClass =
    'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div>
      {cameraOn ? (
        <div className="space-y-3">
          <div className="relative w-full max-w-[260px] mx-auto aspect-square rounded-xl overflow-hidden bg-zinc-900">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
              style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleCapture}
              disabled={busy}
              className={`${buttonClass} text-white bg-zinc-900 hover:bg-zinc-800`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{busy ? 'Guardando...' : 'Capturar foto'}</span>
            </button>
            <button
              type="button"
              onClick={() => startCamera(facing === 'user' ? 'environment' : 'user')}
              disabled={busy}
              className={`${buttonClass} text-zinc-700 bg-zinc-100 hover:bg-zinc-200`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Girar cámara</span>
            </button>
            <button
              type="button"
              onClick={stopCamera}
              disabled={busy}
              className={`${buttonClass} text-zinc-700 bg-zinc-100 hover:bg-zinc-200`}
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-zinc-100 border border-zinc-200 overflow-hidden flex items-center justify-center shrink-0">
            {photo ? (
              <img src={photo} alt="Foto del miembro" className="w-full h-full object-cover" />
            ) : (
              <User className="w-8 h-8 text-zinc-400" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => startCamera(facing)}
              disabled={busy}
              className={`${buttonClass} text-white bg-zinc-900 hover:bg-zinc-800`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{photo ? 'Tomar otra foto' : 'Tomar foto'}</span>
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={busy}
              className={`${buttonClass} text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200`}
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>{busy ? 'Procesando...' : 'Adjuntar foto'}</span>
            </button>
          </div>
        </div>
      )}

      {hint && !cameraOn && !error && <p className="mt-2 text-[11px] text-zinc-500">{hint}</p>}
      {error && (
        <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
};
