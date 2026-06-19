const STORAGE_KEY = "ss-notification-sound-enabled";
const SOUND_DEBOUNCE_MS = 1200;

let sharedContext: AudioContext | null = null;
let lastSoundAt = 0;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const AudioCtx =
    window.AudioContext ||
    (
      window as unknown as {
        webkitAudioContext: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new AudioCtx();
  }

  return sharedContext;
}

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // ignore
  }
}

/** Разблокировать звук после жеста пользователя (политика autoplay в браузерах). */
export async function unlockNotificationAudio(): Promise<void> {
  const ctx = getSharedAudioContext();
  if (!ctx || ctx.state !== "suspended") return;
  try {
    await ctx.resume();
  } catch {
    // ignore
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume = 0.14,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(
    volume,
    ctx.currentTime + start + 0.02,
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    ctx.currentTime + start + duration,
  );
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime + start);
  oscillator.stop(ctx.currentTime + start + duration);
}

/** Короткий звук для in-app уведомлений (Web Audio API). */
export function playNotificationSound(): void {
  if (typeof window === "undefined") return;
  if (!isNotificationSoundEnabled()) return;
  if (document.visibilityState !== "visible") return;

  const now = Date.now();
  if (now - lastSoundAt < SOUND_DEBOUNCE_MS) return;
  lastSoundAt = now;

  const ctx = getSharedAudioContext();
  if (!ctx) return;

  void (async () => {
    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (ctx.state !== "running") return;

      playTone(ctx, 523.25, 0, 0.1);
      playTone(ctx, 659.25, 0.11, 0.12);
      playTone(ctx, 783.99, 0.24, 0.16, 0.12);
    } catch {
      // Браузер заблокировал звук — игнорируем.
    }
  })();
}
