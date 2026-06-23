"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { formatEventTimeRange } from "@/lib/calendar/format";
import {
  postMeetingAudit,
  postMeetingAuditBeacon,
} from "@/lib/calendar/meeting-audit-client";
import type { CalendarEvent } from "@/lib/calendar/types";
import { MeetingAccessGate, type MeetingAccessGateVariant } from "./MeetingAccessGate";
import { MeetingControlBar } from "./MeetingControlBar";
import { MeetingParticipantPanel } from "./MeetingParticipantPanel";
import styles from "./CalendarMeetRoom.module.css";

type MeetingTokenPayload = {
  wsUrl: string;
  token: string;
  roomName: string;
  expiresAt: string;
};

type ConnectState =
  | { status: "loading" }
  | { status: "ready"; credentials: MeetingTokenPayload }
  | { status: "error"; variant: MeetingAccessGateVariant; message?: string };

function mapTokenError(
  status: number,
  error: string,
): { variant: MeetingAccessGateVariant; message?: string } {
  if (status === 503) {
    return { variant: "not_configured", message: error };
  }
  if (status === 404) {
    return { variant: "not_found", message: error };
  }
  if (error === "Not a video meeting") {
    return { variant: "not_video", message: error };
  }
  if (error === "Forbidden") {
    return { variant: "forbidden", message: error };
  }
  if (error === "Meeting window closed") {
    return { variant: "closed", message: error };
  }
  return { variant: "connect_error", message: error };
}

type MeetingStageProps = {
  event: CalendarEvent;
  onLeave: () => void;
};

function MeetingStage({ event, onLeave }: MeetingStageProps) {
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const screenShareTrack = tracks.find(
    (track) => track.source === Track.Source.ScreenShare,
  );
  const screenSharerName =
    screenShareTrack?.participant?.name ||
    screenShareTrack?.participant?.identity;

  return (
    <div className={styles.room}>
      <header className={styles.topBar}>
        <Link href={`/calendar?event=${encodeURIComponent(event.id)}`} className={styles.backLink}>
          ← Выйти
        </Link>
        <div className={styles.topMeta}>
          <span className={styles.eventTitle}>{event.title}</span>
          <span className={styles.eventTime}>{formatEventTimeRange(event)}</span>
        </div>
      </header>

      {screenSharerName ? (
        <div className={styles.shareBanner}>
          {screenSharerName} демонстрирует экран
        </div>
      ) : null}

      <div className={styles.stage}>
        <GridLayout tracks={tracks} className={styles.grid}>
          <ParticipantTile className={styles.tile} />
        </GridLayout>
      </div>

      <MeetingControlBar
        participantCount={participants.length}
        participantsOpen={participantsOpen}
        onToggleParticipants={() => setParticipantsOpen((open) => !open)}
        onLeave={onLeave}
      />

      {participantsOpen ? (
        <MeetingParticipantPanel onClose={() => setParticipantsOpen(false)} />
      ) : null}

      <RoomAudioRenderer />
    </div>
  );
}

type CalendarMeetRoomProps = {
  event: CalendarEvent;
};

export function CalendarMeetRoom({ event }: CalendarMeetRoomProps) {
  const router = useRouter();
  const [connectState, setConnectState] = useState<ConnectState>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadToken() {
      try {
        const response = await fetch(
          `/api/calendar/events/${encodeURIComponent(event.id)}/meeting-token`,
          {
            method: "POST",
            signal: controller.signal,
          },
        );

        const payload = (await response.json()) as MeetingTokenPayload & {
          error?: string;
        };

        if (!response.ok) {
          const mapped = mapTokenError(
            response.status,
            payload.error ?? "Connect failed",
          );
          setConnectState({
            status: "error",
            variant: mapped.variant,
            message: mapped.message,
          });
          return;
        }

        setConnectState({
          status: "ready",
          credentials: payload,
        });
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setConnectState({ status: "error", variant: "connect_error" });
      }
    }

    void loadToken();
    return () => controller.abort();
  }, [event.id]);

  const handleLeave = useCallback(() => {
    router.push(`/calendar?event=${encodeURIComponent(event.id)}`);
  }, [event.id, router]);

  const handleDisconnected = useCallback(() => {
    void postMeetingAudit(event.id, "left");
    handleLeave();
  }, [event.id, handleLeave]);

  const handleConnected = useCallback(() => {
    void postMeetingAudit(event.id, "joined");
  }, [event.id]);

  useEffect(() => {
    function onBeforeUnload() {
      postMeetingAuditBeacon(event.id, "left");
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [event.id]);

  if (connectState.status === "loading") {
    return (
      <div className={styles.page}>
        <div className={styles.loadingCard}>
          <div className={styles.spinner} aria-hidden="true" />
          <p>Подключение к видеовстрече…</p>
        </div>
      </div>
    );
  }

  if (connectState.status === "error") {
    return (
      <MeetingAccessGate
        variant={connectState.variant}
        event={event}
        message={connectState.message}
      />
    );
  }

  const { credentials } = connectState;

  return (
    <div className={styles.page}>
      <LiveKitRoom
        serverUrl={credentials.wsUrl}
        token={credentials.token}
        connect
        audio
        video
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        className={styles.livekitRoom}
      >
        <MeetingStage event={event} onLeave={handleLeave} />
      </LiveKitRoom>
    </div>
  );
}
