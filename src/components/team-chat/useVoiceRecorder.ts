"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceRecorderState = "idle" | "recording" | "uploading";

function getPreferredMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return "";
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    stopStream(streamRef.current);
    streamRef.current = null;
    setElapsedMs(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Браузер не поддерживает запись с микрофона.");
      return false;
    }

    const mimeType = getPreferredMimeType();
    if (!mimeType) {
      setError("Браузер не поддерживает запись голоса.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start(250);
      setState("recording");

      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);

      return true;
    } catch {
      cleanup();
      setError("Не удалось получить доступ к микрофону.");
      return false;
    }
  }, [cleanup]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    setState("idle");
  }, [cleanup]);

  const stopAndGetBlob = useCallback(async (): Promise<{
    blob: Blob;
    durationMs: number;
    mimeType: string;
  } | null> => {
    const recorder = mediaRecorderRef.current;
    const mimeType = recorder?.mimeType || getPreferredMimeType() || "audio/webm";

    if (!recorder || recorder.state === "inactive") {
      cleanup();
      setState("idle");
      return null;
    }

    const durationMs = Date.now() - startedAtRef.current;

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        if (!chunksRef.current.length) {
          resolve(null);
          return;
        }
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.stop();
    });

    cleanup();

    if (!blob || blob.size === 0) {
      setState("idle");
      return null;
    }

    return { blob, durationMs, mimeType };
  }, [cleanup]);

  const setUploading = useCallback((uploading: boolean) => {
    setState(uploading ? "uploading" : "idle");
  }, []);

  return {
    state,
    elapsedMs,
    error,
    startRecording,
    cancelRecording,
    stopAndGetBlob,
    setUploading,
    clearError: () => setError(null),
  };
}
