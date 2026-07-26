import { useEffect, useRef } from "react";
import { useExperimentStore } from "../../store/experimentStore";

/**
 * Scrubbable timeline that drives every data-driven animation (thermal tint on
 * the arm, mechanical indentation). It only moves `playbackTimeS`; the 3D scene
 * and charts read that value and render the real solver output at that instant.
 */
export function PlaybackTimeline({
  durationS,
  label = "Response over time",
}: {
  durationS: number;
  label?: string;
}) {
  const playbackTimeS = useExperimentStore((s) => s.playbackTimeS);
  const isPlaying = useExperimentStore((s) => s.isPlaying);
  const setPlaybackTime = useExperimentStore((s) => s.setPlaybackTime);
  const setPlaying = useExperimentStore((s) => s.setPlaying);
  const lastFrame = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      lastFrame.current = null;
      return;
    }
    // Compress the playback so even long holds animate in a few seconds.
    const speed = Math.max(1, durationS / 6);
    let raf = 0;
    const tick = (now: number) => {
      const prev = lastFrame.current ?? now;
      lastFrame.current = now;
      const next = useExperimentStore.getState().playbackTimeS + ((now - prev) / 1000) * speed;
      if (next >= durationS) {
        setPlaybackTime(durationS);
        setPlaying(false);
        return;
      }
      setPlaybackTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, durationS, setPlaybackTime, setPlaying]);

  const atEnd = playbackTimeS >= durationS - 1e-6;

  return (
    <div className="playback">
      <div className="playback__head">
        <span className="playback__label">{label}</span>
        <span className="playback__time">
          {playbackTimeS.toFixed(1)} / {durationS.toFixed(1)} s
        </span>
      </div>
      <div className="playback__row">
        <button
          type="button"
          className="playback__btn"
          onClick={() => {
            if (atEnd) setPlaybackTime(0);
            setPlaying(!isPlaying);
          }}
        >
          {isPlaying ? "❚❚ Pause" : atEnd ? "↻ Replay" : "▶ Play"}
        </button>
        <input
          className="playback__range"
          type="range"
          min={0}
          max={durationS}
          step={durationS / 400}
          value={Math.min(playbackTimeS, durationS)}
          onChange={(e) => {
            setPlaying(false);
            setPlaybackTime(Number(e.target.value));
          }}
        />
      </div>
    </div>
  );
}
