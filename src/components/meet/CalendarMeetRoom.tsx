"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { formatEventTimeRange } from "@/lib/calendar/format";
import {
  postMeetingAudit,
  postMeetingAuditBeacon,
} from "@/lib/calendar/meeting-audit-client";
import {
  clearMeetingDockActive,
  clearMeetingDockNavigate,
  isMeetingDockMode,
  markMeetingDockActive,
  markMeetingDockNavigate,
  openMeetingDockWindow,
  readMeetingDockNavigateEventId,
  readMeetingDockSession,
} from "@/lib/calendar/meeting-dock";
import type { CalendarEvent } from "@/lib/calendar/types";
import { MeetingAccessGate, type MeetingAccessGateVariant } from "./MeetingAccessGate";
import { MeetingControlBar } from "./MeetingControlBar";
import { MeetingDockGate } from "./MeetingDockGate";
import { MeetingParticipantPanel } from "./MeetingParticipantPanel";
import { MeetingSpeakerLayout } from "./MeetingSpeakerLayout";
import {
  MeetingGuestWaitingBanner,
  usePendingGuestAdmissions,
} from "./MeetingGuestWaitingBanner";
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
  isDockMode: boolean;
  onWorkOnPlatform: () => void;
};

function MeetingStage({
  event,
  onLeave,
  isDockMode,
  onWorkOnPlatform,
}: MeetingStageProps) {
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const participants = useParticipants();
  const pendingGuestAdmissions = usePendingGuestAdmissions(event.id);

  return (
    <div className={styles.room}>
      <header className={styles.topBar}>
        {isDockMode ? (
          <span className={styles.dockBadge}>Окно звонка</span>
        ) : (
          <Link href={`/calendar?event=${encodeURIComponent(event.id)}`} className={styles.backLink}>
            ← Выйти
          </Link>
        )}
        <div className={styles.topMeta}>
          <span className={styles.eventTitle}>{event.title}</span>
          <span className={styles.eventTime}>{formatEventTimeRange(event)}</span>
        </div>
        {!isDockMode ? (
          <button
            type="button"
            className={styles.platformButton}
            onClick={onWorkOnPlatform}
            title="Открыть звонок в отдельном окне и работать на платформе"
          >
            <i className="fa-solid fa-desktop" aria-hidden="true" />
            Работать на платформе
          </button>
        ) : null}
      </header>

      {isDockMode ? (
        <div className={styles.dockHint}>
          Откройте нужный раздел в основном окне браузера. Затем здесь нажмите
          «Поделиться экраном» и в диалоге выберите окно с платформой — не это
          окно звонка.
        </div>
      ) : null}

      <MeetingGuestWaitingBanner
        count={pendingGuestAdmissions.length}
        onOpenParticipants={() => setParticipantsOpen(true)}
      />

      <div className={styles.stage}>
        <MeetingSpeakerLayout compact={isDockMode} />
      </div>

      <MeetingControlBar
        eventId={event.id}
        participantCount={participants.length}
        pendingGuestCount={pendingGuestAdmissions.length}
        participantsOpen={participantsOpen}
        onToggleParticipants={() => setParticipantsOpen((open) => !open)}
        onLeave={onLeave}
        compact={isDockMode}
      />

      {participantsOpen ? (
        <MeetingParticipantPanel
          eventId={event.id}
          onClose={() => setParticipantsOpen(false)}
        />
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
  const searchParams = useSearchParams();
  const isDockMode = isMeetingDockMode(searchParams);
  const [bypassDockGate, setBypassDockGate] = useState(false);
  const [dockChecked, setDockChecked] = useState(false);
  const [dockSession, setDockSession] = useState(
    null as ReturnType<typeof readMeetingDockSession>,
  );
  const [connectState, setConnectState] = useState<ConnectState>({
    status: "loading",
  });

  useEffect(() => {
    setDockSession(readMeetingDockSession());
    setDockChecked(true);
  }, []);

  const showDockGate =
    dockChecked &&
    !isDockMode &&
    !bypassDockGate &&
    dockSession?.eventId === event.id;

  useEffect(() => {
    if (showDockGate) {
      return;
    }

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
  }, [event.id, showDockGate]);

  const handleLeave = useCallback(() => {
    clearMeetingDockActive();
    clearMeetingDockNavigate();
    router.push(`/calendar?event=${encodeURIComponent(event.id)}`);
  }, [event.id, router]);

  const handleDisconnected = useCallback(() => {
    if (readMeetingDockNavigateEventId() === event.id) {
      clearMeetingDockNavigate();
      router.push("/dashboard");
      return;
    }

    void postMeetingAudit(event.id, "left");
    handleLeave();
  }, [event.id, handleLeave, router]);

  const handleConnected = useCallback(() => {
    void postMeetingAudit(event.id, "joined");

    if (isDockMode) {
      markMeetingDockActive({
        eventId: event.id,
        title: event.title,
        openedAt: new Date().toISOString(),
      });
    }
  }, [event.id, event.title, isDockMode]);

  const handleWorkOnPlatform = useCallback(() => {
    const popup = openMeetingDockWindow(event.id);
    if (!popup) {
      window.alert(
        "Не удалось открыть окно звонка. Разрешите всплывающие окна для платформы и попробуйте снова.",
      );
      return;
    }

    markMeetingDockActive({
      eventId: event.id,
      title: event.title,
      openedAt: new Date().toISOString(),
    });
    markMeetingDockNavigate(event.id);

    window.setTimeout(() => {
      if (readMeetingDockNavigateEventId() === event.id) {
        clearMeetingDockNavigate();
        router.push("/dashboard");
      }
    }, 6000);
  }, [event.id, event.title, router]);

  useEffect(() => {
    function onBeforeUnload() {
      postMeetingAuditBeacon(event.id, "left");
      if (isDockMode) {
        clearMeetingDockActive();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [event.id, isDockMode]);

  if (!dockChecked) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingCard}>
          <div className={styles.spinner} aria-hidden="true" />
          <p>Подключение к видеовстрече…</p>
        </div>
      </div>
    );
  }

  if (showDockGate) {
    return (
      <div className={styles.page}>
        <MeetingDockGate
          eventId={event.id}
          eventTitle={event.title}
          onConnectHere={() => setBypassDockGate(true)}
        />
      </div>
    );
  }

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
    <div className={[styles.page, isDockMode ? styles.pageDock : ""].filter(Boolean).join(" ")}>
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
        <MeetingStage
          event={event}
          onLeave={handleLeave}
          isDockMode={isDockMode}
          onWorkOnPlatform={handleWorkOnPlatform}
        />
      </LiveKitRoom>
    </div>
  );
}
