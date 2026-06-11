/** Короткий звук для in-app уведомлений (Web Audio API, без файла). */
export function playNotificationSound(): void {
  if (typeof window === "undefined") return;
  if (document.visibilityState !== "visible") return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    const playTone = (frequency: number, start: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(
        0.1,
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
    };

    playTone(523.25, 0, 0.12);
    playTone(659.25, 0.13, 0.14);

    window.setTimeout(() => {
      void ctx.close();
    }, 400);
  } catch {
    // Браузер заблокировал звук до жеста пользователя — игнорируем.
  }
}
