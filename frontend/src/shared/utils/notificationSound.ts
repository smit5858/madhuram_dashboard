let audioContext: AudioContext | null = null;

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

// Browsers start an AudioContext "suspended" until a user gesture occurs on the page, and refuse
// to auto-resume it otherwise. Since notifications can arrive before the user has clicked
// anything on the current page load (e.g. right after login), we resume on the first pointer/key
// interaction so the very first live notification isn't silently dropped.
const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
};

if (typeof document !== "undefined") {
  const resumeOnGesture = () => {
    audioContext?.resume().catch(() => {});
  };
  ["pointerdown", "keydown"].forEach((evt) =>
    document.addEventListener(evt, resumeOnGesture, { passive: true })
  );
}

const playTone = (ctx: AudioContext, frequency: number, startTime: number, duration: number) => {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
};

/** Plays a short two-note chime via the Web Audio API — no audio asset/dependency needed. Safe to
 *  call freely: swallows all errors (unsupported browser, autoplay still blocked, etc.) so a sound
 *  failure can never break notification delivery. */
export const playNotificationSound = (): void => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    playTone(ctx, 880, now, 0.16);
    playTone(ctx, 1318.51, now + 0.14, 0.22);
  } catch {
    // Ignore — sound is a non-critical enhancement.
  }
};
