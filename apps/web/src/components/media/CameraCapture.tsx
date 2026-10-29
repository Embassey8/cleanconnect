"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PHASE_LABEL, fitWithin, stampText, type MediaPhase } from "@cleanconnect/shared";
import { uploadPhoto } from "@/app/media/actions";

const btn = "min-h-11 rounded-input px-4 text-sm font-bold disabled:opacity-60";

/**
 * In-app camera. There is deliberately no file picker: photos come straight from the live camera, are
 * re-encoded from a canvas (which drops EXIF/GPS) and are stamped before they leave the device.
 */
export function CameraCapture({
  orderId, phases, reviewId, label = "Take a photo",
}: { orderId: string; phases: MediaPhase[]; reviewId?: string; label?: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [phase, setPhase] = useState<MediaPhase>(phases[0]);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  };
  useEffect(() => stop, []);

  async function open() {
    setMessage({});
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage({ error: "This device or browser has no camera access. Photos can only be taken with the in-app camera." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setLive(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } });
    } catch {
      setMessage({ error: "Camera permission was denied. Allow camera access to take photos." });
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const { width, height } = fitWithin(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    const text = stampText(new Date());
    const size = Math.max(14, Math.round(width / 40));
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const pad = size * 0.6;
    const w = ctx.measureText(text).width + pad * 2;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(pad, height - size - pad * 2.2, w, size + pad * 1.4);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, pad * 2, height - pad * 1.9);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setShot({ blob, url: URL.createObjectURL(blob) });
      stop();
    }, "image/jpeg", 0.82);
  }

  function discard() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  }

  function save() {
    if (!shot) return;
    const form = new FormData();
    form.set("photo", new File([shot.blob], "photo.jpg", { type: "image/jpeg" }));
    form.set("orderId", orderId);
    form.set("phase", phase);
    if (reviewId) form.set("reviewId", reviewId);
    start(async () => {
      const r = await uploadPhoto(form);
      setMessage(r);
      if (r.ok) { discard(); router.refresh(); }
    });
  }

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-4">
      {!live && !shot && <button type="button" onClick={open} className={`${btn} bg-primary text-white hover:bg-primary-hover`}>{label}</button>}
      {live && (
        <div className="space-y-2">
          <video ref={videoRef} playsInline muted className="w-full rounded-input bg-ink" />
          <div className="flex gap-2">
            <button type="button" onClick={capture} className={`${btn} bg-primary text-white`}>Capture</button>
            <button type="button" onClick={stop} className={`${btn} border border-border`}>Cancel</button>
          </div>
        </div>
      )}
      {shot && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt="Photo preview" className="w-full rounded-input" />
          {phases.length > 1 && (
            <label className="block text-sm font-semibold">This photo shows
              <select value={phase} onChange={(e) => setPhase(e.target.value as MediaPhase)} className="mt-1 block min-h-11 w-full rounded-input border border-border bg-surface px-3">
                {phases.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={save} className={`${btn} bg-primary text-white`}>{pending ? "Saving…" : "Save photo"}</button>
            <button type="button" disabled={pending} onClick={discard} className={`${btn} border border-border`}>Retake</button>
          </div>
        </div>
      )}
      {message.error && <p role="alert" className="text-sm text-danger">{message.error}</p>}
      {message.ok && <p role="status" className="text-sm font-semibold text-primary">{message.ok}</p>}
      <p className="text-xs text-muted">Photos are taken with the camera only and stamped &ldquo;Taken on CleanConnect&rdquo;. Location data is never kept.</p>
    </div>
  );
}
