import { useEffect, useRef, useState } from 'react';
import { ModalFrame } from './ModalFrame';

export interface LiveCameraCaptureModalProps {
  open: boolean;
  title?: string;
  description?: string;
  facingModeDefault?: 'user' | 'environment';
  guideType?: 'face' | 'facade' | 'facility';
  onClose: () => void;
  onCapture: (blob: Blob, dataUrl: string) => Promise<void> | void;
  uploading?: boolean;
}

export function LiveCameraCaptureModal({
  open,
  title = 'Live Camera Photo Capture',
  description = 'Align within the frame and capture a live photo directly from your camera.',
  facingModeDefault = 'environment',
  guideType = 'facade',
  onClose,
  onCapture,
  uploading = false,
}: LiveCameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(facingModeDefault);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [processingSnap, setProcessingSnap] = useState(false);

  // Sync facing mode default on open
  useEffect(() => {
    if (open) {
      setFacingMode(facingModeDefault);
      setCapturedBlob(null);
      setCapturedPreviewUrl(null);
      setCameraError(null);
    }
  }, [open, facingModeDefault]);

  // Stop camera helper
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Start camera stream when open and no capture preview
  useEffect(() => {
    if (!open || capturedPreviewUrl) {
      stopCameraStream();
      return;
    }

    let isMounted = true;

    async function startCamera() {
      stopCameraStream();
      setCameraError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access is not supported by your browser. Please use a modern browser with webcam support.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Unknown camera error';
        if (msg.includes('Permission') || msg.includes('denied') || msg.includes('NotAllowedError')) {
          setCameraError('Camera permission was denied. Please allow camera access in your browser site permissions to take a live photo.');
        } else {
          setCameraError(`Unable to start camera: ${msg}. Please check if another app is using your webcam.`);
        }
      }
    }

    void startCamera();

    return () => {
      isMounted = false;
      stopCameraStream();
    };
  }, [open, facingMode, capturedPreviewUrl]);

  // Snap photo from video feed
  function handleSnapPhoto() {
    if (!videoRef.current) return;
    setProcessingSnap(true);

    try {
      const video = videoRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;

      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas rendering context unavailable');
      }

      // Draw the video frame
      ctx.drawImage(video, 0, 0, width, height);

      // Add a clean watermark timestamp for audit verification
      const nowStr = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium',
      });
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(10, height - 32, 280, 24);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`Live Capture: ${nowStr} IST`, 16, height - 16);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedPreviewUrl(dataUrl);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            setCapturedBlob(blob);
          }
          setProcessingSnap(false);
        },
        'image/jpeg',
        0.9
      );
    } catch (err: unknown) {
      setProcessingSnap(false);
      setCameraError(err instanceof Error ? err.message : 'Failed to capture frame from camera.');
    }
  }

  function handleRetake() {
    setCapturedBlob(null);
    setCapturedPreviewUrl(null);
    setCameraError(null);
  }

  async function handleConfirm() {
    if (!capturedBlob || !capturedPreviewUrl) return;
    await onCapture(capturedBlob, capturedPreviewUrl);
    handleClose();
  }

  function handleClose() {
    stopCameraStream();
    setCapturedBlob(null);
    setCapturedPreviewUrl(null);
    onClose();
  }

  function toggleCamera() {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }

  return (
    <ModalFrame
      open={open}
      onClose={handleClose}
      title={title}
      subtitle={description}
      maxWidth="560px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Camera Viewport or Captured Preview */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '320px',
            backgroundColor: '#0F172A',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #0D9488',
          }}
        >
          {capturedPreviewUrl ? (
            // Preview captured snapshot
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <img
                src={capturedPreviewUrl}
                alt="Captured Live"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: 'rgba(13, 148, 136, 0.9)',
                  color: '#FFFFFF',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                }}
              >
                <span>✓</span> Live Camera Captured
              </div>
            </div>
          ) : cameraError ? (
            // Error State
            <div style={{ padding: '20px', textAlign: 'center', color: '#F87171', maxWidth: '400px' }}>
              <div style={{ fontSize: '2.2rem', marginBottom: '8px' }}>⚠️</div>
              <strong style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem' }}>Camera Unavailable</strong>
              <div style={{ fontSize: '0.78rem', color: '#CBD5E1', lineHeight: 1.5 }}>{cameraError}</div>
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: '14px', fontSize: '0.78rem', background: '#334155', color: '#FFF' }}
                onClick={() => setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
              >
                🔄 Try Alternative Camera
              </button>
            </div>
          ) : (
            // Active Live Stream
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                }}
              />

              {/* Live Overlay Guides */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {guideType === 'face' ? (
                  // Oval face outline for Phlebotomist portrait
                  <div
                    style={{
                      width: '180px',
                      height: '240px',
                      border: '2px dashed rgba(255, 255, 255, 0.8)',
                      borderRadius: '50%',
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
                    }}
                  />
                ) : (
                  // Rectangular outline for Lab exterior facade or interior
                  <div
                    style={{
                      width: '85%',
                      height: '75%',
                      border: '2px dashed rgba(255, 255, 255, 0.8)',
                      borderRadius: '8px',
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
                    }}
                  />
                )}
              </div>

              {/* Status pill on video */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: '#34D399',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34D399', display: 'inline-block' }} />
                LIVE STREAM ({facingMode === 'user' ? 'Front / Selfie' : 'Rear / Environment'})
              </div>

              {/* Camera Switch Button */}
              <button
                type="button"
                onClick={toggleCamera}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '20px',
                  padding: '5px 10px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                🔄 Switch Camera
              </button>
            </>
          )}

          {/* Hidden Canvas for capture rendering */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
          {capturedPreviewUrl ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleRetake}
                disabled={uploading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                🔄 Retake Photo
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirm}
                disabled={uploading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px' }}
              >
                {uploading ? '⏳ Uploading...' : '✓ Confirm & Use Live Photo'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSnapPhoto}
                disabled={!cameraActive || Boolean(cameraError) || processingSnap}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 24px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(13, 148, 136, 0.4)',
                }}
              >
                <span>📸</span> {processingSnap ? 'Capturing...' : 'Snap Live Photo'}
              </button>
            </>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
