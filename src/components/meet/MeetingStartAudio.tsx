"use client";

import { StartAudio } from "@livekit/components-react";
import styles from "./MeetingStartAudio.module.css";

/** Browser autoplay unlock — required for guests who join without a gesture. */
export function MeetingStartAudio() {
  return (
    <StartAudio
      label="Включить звук"
      className={styles.banner}
    />
  );
}
