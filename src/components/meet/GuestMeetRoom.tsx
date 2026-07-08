"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { formatEventTimeRange } from "@/lib/calendar/format";
import { CALENDAR_TIMEZONE } from "@/lib/calendar/constants";
import type { CalendarEvent } from "@/lib/calendar/types";
import { GuestMeetingGate } from "./GuestMeetingGate";
import { MeetingControlBar } from "./MeetingControlBar";
import { MeetingParticipantPanel } from "./MeetingParticipantPanel";
import { MeetingSpeakerLayout } from "./MeetingSpeakerLayout";
import meetStyles from "./CalendarMeetRoom.module.css";
import styles from "./GuestMeetRoom.module.css";

type GuestTokenPayload = {
  wsUrl: string;
  token: string;
  roomName: string;
  expiresAt: string;
  guestId: string;
  eventTitle: string;
};

type ConnectState =
  | { status: "lobby" }
  | { status: "loading" }
  | { status: "ready"; credentials: GuestTokenPayload; displayName: string }
  | { status: "error"; message: string }
  | { status: "left" };

async function postGuestAudit(
  inviteToken: string,
  guestId: string,
  displayName: string,
  action: "joined" | "left",
  options?: { keepalive?: boolean },
): Promise<void> {
  await fetch("/api/meet/guest-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteToken, guestId, displayName, action }),
    keepalive: options?.keepalive ?? false,
  });
}

type GuestMeetingStageProps = {
  event: CalendarEvent;
  inviteToken: string;
  displayName: string;
  guestId: string;
  onLeave: () => void;
};

function GuestMeetingStage({
  event,
  inviteToken,
  displayName,
  guestId,
  onLeave,
}: GuestMeetingStageProps) {
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const participants = useParticipants();

  return (
    <div className={styles.room}>
      <header className={styles.topBar}>
        <div className={styles.topMeta}>
          <span className={styles.guestBadge}>Гостевой вход</span>
          <span className={styles.eventTitle}>{event.title}</span>
          <span className={styles.eventTime}>
            {formatEventTimeRange(event, CALENDAR_TIMEZONE)}
          </span>
        </div>
        <span className={styles.guestName}>{displayName}</span>
      </header>

      <div className={meetStyles.stage}>
        <MeetingSpeakerLayout />
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

      <GuestAuditReporter
        inviteToken={inviteToken}
        guestId={guestId}
        displayName={displayName}
      />
    </div>
  );
}

function GuestAuditReporter({
  inviteToken,
  guestId,
  displayName,
}: {
  inviteToken: string;
  guestId: string;
  displayName: string;
}) {
  useEffect(() => {
    void postGuestAudit(inviteToken, guestId, displayName, "joined");

    function onBeforeUnload() {
      void postGuestAudit(inviteToken, guestId, displayName, "left", {
        keepalive: true,
      });
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [displayName, guestId, inviteToken]);

  return null;
}

type GuestMeetRoomProps = {
  event: CalendarEvent;
  inviteToken: string;
};

export function GuestMeetRoom({ event, inviteToken }: GuestMeetRoomProps) {
  const [displayName, setDisplayName] = useState("");
  const [connectState, setConnectState] = useState<ConnectState>({
    status: "lobby",
  });

  const handleJoin = useCallback(async () => {
    const trimmed = displayName.trim();
    if (trimmed.length < 2) {
      return;
    }

    setConnectState({ status: "loading" });

    try {
      const response = await fetch("/api/meet/guest-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteToken,
          displayName: trimmed,
        }),
      });

      const payload = (await response.json()) as GuestTokenPayload & {
        error?: string;
      };

      if (!response.ok) {
        setConnectState({
          status: "error",
          message: payload.error ?? "Не удалось подключиться",
        });
        return;
      }

      setConnectState({
        status: "ready",
        credentials: payload,
        displayName: trimmed,
      });
    } catch {
      setConnectState({
        status: "error",
        message: "Не удалось подключиться. Проверьте интернет и попробуйте снова.",
      });
    }
  }, [displayName, inviteToken]);

  const handleLeave = useCallback(() => {
    if (connectState.status === "ready") {
      void postGuestAudit(
        inviteToken,
        connectState.credentials.guestId,
        connectState.displayName,
        "left",
      );
    }
    setConnectState({ status: "left" });
  }, [connectState, inviteToken]);

  const handleDisconnected = useCallback(() => {
    handleLeave();
  }, [handleLeave]);

  if (connectState.status === "left") {
    return <GuestMeetingGate variant="left" event={event} />;
  }

  if (connectState.status === "lobby" || connectState.status === "loading" || connectState.status === "error") {
    return (
      <div className={styles.lobbyPage}>
        <div className={styles.lobbyCard}>
          <p className={styles.lobbyBrand}>Sharp & Spice</p>
          <h1 className={styles.lobbyTitle}>Видеовстреча</h1>
          <p className={styles.lobbyEventTitle}>{event.title}</p>
          <p className={styles.lobbyEventTime}>
            {formatEventTimeRange(event, CALENDAR_TIMEZONE)}
          </p>

          <label className={styles.nameLabel} htmlFor="guest-display-name">
            Ваше имя
          </label>
          <input
            id="guest-display-name"
            className={styles.nameInput}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Как вас представить участникам"
            maxLength={80}
            autoComplete="name"
            disabled={connectState.status === "loading"}
          />

          {connectState.status === "error" ? (
            <p className={styles.error}>{connectState.message}</p>
          ) : null}

          <button
            type="button"
            className={styles.joinButton}
            onClick={() => void handleJoin()}
            disabled={
              connectState.status === "loading" || displayName.trim().length < 2
            }
          >
            {connectState.status === "loading" ? "Подключение…" : "Присоединиться"}
          </button>
        </div>
      </div>
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
        onDisconnected={handleDisconnected}
        className={styles.livekitRoom}
      >
        <GuestMeetingStage
          event={event}
          inviteToken={inviteToken}
          displayName={connectState.displayName}
          guestId={credentials.guestId}
          onLeave={handleLeave}
        />
      </LiveKitRoom>
    </div>
  );
}
