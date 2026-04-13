'use client';

/**
 * Driver-facing POD capture page.
 * Mobile-optimized — minimal UI, big touch targets.
 * Accessed from the dispatch detail panel "Open POD" button.
 *
 * Features:
 *  - Take / select photos (camera or library)
 *  - Preview thumbnails with delete option
 *  - Signature canvas (touch + mouse)
 *  - Signer name field
 *  - Submit: uploads photos to R2, sends signature to Agility
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, Trash2, RotateCcw, Check, AlertCircle, ChevronLeft, Pen } from 'lucide-react';

interface Props {
  soNumber: string;
  branchCode: string;
  shipmentNum: number;
  agilityGuid: string;
  customerName: string;
  driverName: string;
}

interface PhotoPreview {
  file: File;
  objectUrl: string;
}

type Step = 'photos' | 'signature' | 'done';

export default function PodCaptureClient({
  soNumber, branchCode, shipmentNum, agilityGuid, customerName, driverName,
}: Props) {
  const [step, setStep]               = useState<Step>('photos');
  const [photos, setPhotos]           = useState<PhotoPreview[]>([]);
  const [signerName, setSignerName]   = useState(customerName || '');
  const [notes, setNotes]             = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [hasSig, setHasSig]           = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const drawing      = useRef(false);
  const lastPt       = useRef<{ x: number; y: number } | null>(null);

  // ── Photo management ──────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const previews = files.map((f) => ({ file: f, objectUrl: URL.createObjectURL(f) }));
    setPhotos((prev) => [...prev, ...previews].slice(0, 10));
    e.target.value = '';
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[idx].objectUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  useEffect(() => {
    return () => { photos.forEach((p) => URL.revokeObjectURL(p.objectUrl)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Signature canvas ──────────────────────────────────────────────────────

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width  / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPt.current  = getPoint(e);
    setHasSig(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !lastPt.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const pt  = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    lastPt.current = pt;
  }

  function onPointerUp() {
    drawing.current = false;
    lastPt.current  = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  function getSignatureDataUrl(): string | null {
    if (!hasSig || !canvasRef.current) return null;
    return canvasRef.current.toDataURL('image/png');
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError('');

    try {
      // 1. Upload photos
      if (photos.length > 0) {
        const form = new FormData();
        form.append('branch',       branchCode);
        form.append('shipment_num', String(shipmentNum));
        form.append('category',     'delivery');
        form.append('driver_name',  driverName);
        form.append('notes',        notes);
        if (agilityGuid) form.append('agility_guid', agilityGuid);
        photos.forEach((p) => form.append('photos', p.file));

        const photoRes = await fetch(`/api/pod/${encodeURIComponent(soNumber)}/photos`, {
          method: 'POST',
          body: form,
        });
        if (!photoRes.ok) {
          const d = await photoRes.json();
          throw new Error(d.error ?? 'Photo upload failed');
        }
      }

      // 2. Send signature to Agility (if drawn)
      const sigDataUrl = getSignatureDataUrl();
      if (sigDataUrl && signerName.trim()) {
        // Strip the data:image/png;base64, prefix
        const base64 = sigDataUrl.replace(/^data:image\/[^;]+;base64,/, '');
        const sigRes = await fetch(`/api/dispatch/orders/${encodeURIComponent(soNumber)}/pod`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchCode,
            signerName: signerName.trim(),
            signatureData: base64,
          }),
        });
        // Non-fatal if Agility isn't configured yet — still mark done
        if (!sigRes.ok) {
          const d = await sigRes.json().catch(() => ({}));
          console.warn('[POD] Signature push failed (non-fatal):', d.error);
        }
      }

      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, signerName, notes, soNumber, branchCode, shipmentNum, driverName, agilityGuid, hasSig]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100dvh', background: '#0f172a', color: '#e2e8f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* Header */}
      <div style={{
        background: '#1e293b', borderBottom: '1px solid #334155',
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => window.history.back()}
          style={{ background: 'none', border: 'none', color: '#94a3b8',
                   cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#67e8f9' }}>
            POD — {soNumber}
          </div>
          {customerName && (
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 1, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customerName}
            </div>
          )}
        </div>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(['photos', 'signature'] as Step[]).map((s, i) => (
            <div key={s} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: step === s ? '#67e8f9' : step === 'done' ? '#22d3ee' : '#334155',
            }} />
          ))}
        </div>
      </div>

      {/* ── Step: Photos ──────────────────────────────────────────────────── */}
      {step === 'photos' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex',
                      flexDirection: 'column', gap: 16 }}>

          <div>
            <p style={{ fontSize: '0.8125rem', color: '#94a3b8', marginBottom: 12 }}>
              Take photos of the delivered material at the jobsite. Include the full load
              and address marker if possible.
            </p>

            {/* Camera button */}
            <input
              ref={fileInputRef} type="file"
              accept="image/*" capture="environment"
              multiple style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={photos.length >= 10}
              style={{
                width: '100%', padding: '18px 16px',
                background: photos.length >= 10 ? '#1e293b' : '#164e63',
                border: `2px dashed ${photos.length >= 10 ? '#334155' : '#0e7490'}`,
                borderRadius: 12, color: photos.length >= 10 ? '#475569' : '#67e8f9',
                fontSize: '1rem', fontWeight: 600, cursor: photos.length >= 10 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              <Camera size={22} />
              {photos.length === 0 ? 'Take / Select Photos' : `Add More (${photos.length}/10)`}
            </button>
          </div>

          {/* Photo previews */}
          {photos.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
            }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden',
                                      border: '1px solid #334155', aspectRatio: '4/3' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.objectUrl} alt={p.file.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <button
                    onClick={() => removePhoto(i)}
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      background: 'rgba(15,23,42,0.8)', border: 'none',
                      borderRadius: '50%', padding: 6, cursor: 'pointer',
                      color: '#f87171', display: 'flex',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b',
                            marginBottom: 6, fontWeight: 600, textTransform: 'uppercase',
                            letterSpacing: '0.05em' }}>
              Delivery Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. left on porch, called customer..."
              rows={3}
              style={{
                width: '100%', background: '#1e293b', border: '1px solid #334155',
                borderRadius: 10, color: '#e2e8f0', padding: '12px 14px',
                fontSize: '0.9375rem', resize: 'none', outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                          background: '#450a0a', border: '1px solid #7f1d1d',
                          borderRadius: 10, padding: '12px 14px', color: '#fca5a5',
                          fontSize: '0.875rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* Next / Skip */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 8 }}>
            <button
              onClick={() => setStep('signature')}
              style={{
                padding: '16px', background: '#0e7490', border: 'none',
                borderRadius: 12, color: '#fff', fontSize: '1rem', fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Next: Get Signature
            </button>
            <button
              onClick={() => setStep('signature')}
              style={{
                padding: '14px', background: 'transparent',
                border: '1px solid #334155', borderRadius: 12,
                color: '#64748b', fontSize: '0.875rem', cursor: 'pointer',
              }}
            >
              Skip Photos → Signature Only
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Signature ───────────────────────────────────────────────── */}
      {step === 'signature' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16,
                      display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Signer name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b',
                            marginBottom: 6, fontWeight: 600, textTransform: 'uppercase',
                            letterSpacing: '0.05em' }}>
              Signer Name
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Customer or recipient name"
              style={{
                width: '100%', background: '#1e293b', border: '1px solid #334155',
                borderRadius: 10, color: '#e2e8f0', padding: '14px',
                fontSize: '1rem', outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Signature canvas */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600,
                              textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Signature
              </label>
              <button
                onClick={clearSignature}
                style={{ background: 'none', border: 'none', color: '#475569',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          gap: 4, fontSize: '0.75rem' }}
              >
                <RotateCcw size={12} /> Clear
              </button>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 4,
                          border: '2px solid #334155', position: 'relative' }}>
              {!hasSig && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 6, pointerEvents: 'none',
                  color: '#94a3b8',
                }}>
                  <Pen size={20} />
                  <span style={{ fontSize: '0.8125rem' }}>Sign here</span>
                </div>
              )}
              <canvas
                ref={canvasRef}
                width={600} height={220}
                style={{ display: 'block', width: '100%', height: 'auto',
                          touchAction: 'none', cursor: 'crosshair', borderRadius: 8 }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
            </div>
            <p style={{ fontSize: '0.6875rem', color: '#475569', marginTop: 6 }}>
              Signature optional — tap &ldquo;Customer Not Available&rdquo; to skip.
            </p>
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start',
                          background: '#450a0a', border: '1px solid #7f1d1d',
                          borderRadius: 10, padding: '12px 14px', color: '#fca5a5',
                          fontSize: '0.875rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* Summary */}
          <div style={{ background: '#1e293b', borderRadius: 10, padding: 14,
                        fontSize: '0.8125rem', color: '#94a3b8', lineHeight: 1.7 }}>
            <div><strong style={{ color: '#cbd5e1' }}>SO:</strong> {soNumber}</div>
            <div><strong style={{ color: '#cbd5e1' }}>Branch:</strong> {branchCode}</div>
            <div><strong style={{ color: '#cbd5e1' }}>Photos:</strong> {photos.length}</div>
            <div><strong style={{ color: '#cbd5e1' }}>Signature:</strong> {hasSig ? 'Drawn' : 'None'}</div>
            <div><strong style={{ color: '#cbd5e1' }}>Driver:</strong> {driverName}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 8 }}>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: '16px', background: submitting ? '#1e293b' : '#15803d',
                border: 'none', borderRadius: 12, color: '#fff',
                fontSize: '1rem', fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Check size={18} />
              {submitting ? 'Submitting…' : 'Confirm Delivery'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: '14px', background: 'transparent',
                border: '1px solid #334155', borderRadius: 12,
                color: '#64748b', fontSize: '0.875rem', cursor: 'pointer',
              }}
            >
              Customer Not Available to Sign
            </button>
            <button
              onClick={() => { setError(''); setStep('photos'); }}
              disabled={submitting}
              style={{
                padding: '14px', background: 'transparent',
                border: 'none', color: '#475569', fontSize: '0.875rem', cursor: 'pointer',
              }}
            >
              ← Back to Photos
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Done ────────────────────────────────────────────────────── */}
      {step === 'done' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      padding: 32, textAlign: 'center', gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%',
                        background: '#14532d', display: 'flex',
                        alignItems: 'center', justifyContent: 'center' }}>
            <Check size={36} color="#4ade80" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4ade80' }}>
              Delivery Confirmed
            </h2>
            <p style={{ color: '#64748b', marginTop: 6, fontSize: '0.875rem' }}>
              {photos.length > 0 && `${photos.length} photo${photos.length !== 1 ? 's' : ''} uploaded. `}
              {hasSig && 'Signature recorded. '}
              All records saved.
            </p>
          </div>
          <div style={{ background: '#1e293b', borderRadius: 10, padding: '12px 20px',
                        fontSize: '0.8125rem', color: '#94a3b8', lineHeight: 1.8 }}>
            <div>SO: <strong style={{ color: '#67e8f9' }}>{soNumber}</strong></div>
            <div>Branch: {branchCode} · Shipment #{shipmentNum}</div>
          </div>
          <button
            onClick={() => window.history.back()}
            style={{
              marginTop: 8, padding: '14px 32px', background: '#0e7490',
              border: 'none', borderRadius: 12, color: '#fff',
              fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Back to Dispatch
          </button>
        </div>
      )}
    </div>
  );
}
