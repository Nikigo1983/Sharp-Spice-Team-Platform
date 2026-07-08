"use client";

import { useMemo, useState } from "react";
import type { ParticipantClickEvent } from "@livekit/components-core";
import { isTrackReference } from "@livekit/components-core";
import {
  CarouselLayout,
  FocusLayout,
  GridLayout,
  ParticipantTile,
  useLocalParticipant,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import {
  MEETING_GRID_MAX_PARTICIPANTS,
  pickCameraTracks,
  pickScreenShareTrack,
  resolveSpeakerCarouselTracks,
  resolveSpeakerFocusTrack,
} from "@/lib/calendar/meeting-speaker-focus";
import styles from "./CalendarMeetRoom.module.css";

export function MeetingSpeakerLayout({ compact = false }: { compact?: boolean }) {
  const { localParticipant } = useLocalParticipant();
  const activeSpeakers = useSpeakingParticipants();
  const [pinnedTrack, setPinnedTrack] = useState<
    ReturnType<typeof useTracks>[number] | null
  >(null);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );

  const cameraTracks = useMemo(() => pickCameraTracks(tracks), [tracks]);
  const screenShareTrack = useMemo(() => pickScreenShareTrack(tracks), [tracks]);

  const useGridLayout =
    !screenShareTrack &&
    !compact &&
    cameraTracks.length <= MEETING_GRID_MAX_PARTICIPANTS;

  const focusTrack = useMemo(
    () =>
      useGridLayout
        ? null
        : resolveSpeakerFocusTrack({
            cameraTracks,
            screenShareTrack,
            pinnedTrack: screenShareTrack ? null : pinnedTrack,
            activeSpeakers,
            localParticipantIdentity: localParticipant.identity,
          }),
    [
      activeSpeakers,
      cameraTracks,
      localParticipant.identity,
      pinnedTrack,
      screenShareTrack,
      useGridLayout,
    ],
  );

  const carouselTracks = useMemo(
    () => resolveSpeakerCarouselTracks(cameraTracks, focusTrack),
    [cameraTracks, focusTrack],
  );

  function handleParticipantClick(event: ParticipantClickEvent) {
    if (!isTrackReference(event.track) || event.track.source !== Track.Source.Camera) {
      return;
    }
    setPinnedTrack(event.track);
  }

  const filmstrip = carouselTracks.length > 0 ? (
    <div
      className={[
        styles.filmstrip,
        screenShareTrack ? styles.filmstripScreenShare : "",
        compact ? styles.filmstripCompact : "",
        screenShareTrack && compact ? styles.filmstripScreenShareCompact : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <CarouselLayout
        tracks={carouselTracks}
        orientation="horizontal"
        className={styles.filmstripCarousel}
      >
        <ParticipantTile
          className={[
            styles.filmstripTile,
            screenShareTrack ? styles.filmstripTileScreenShare : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onParticipantClick={handleParticipantClick}
        />
      </CarouselLayout>
    </div>
  ) : null;

  if (useGridLayout) {
    return (
      <div
        className={styles.participantGridStage}
        data-participant-count={String(cameraTracks.length)}
      >
        <GridLayout tracks={cameraTracks} className={styles.participantGrid}>
          <ParticipantTile
            className={styles.gridTile}
            onParticipantClick={handleParticipantClick}
          />
        </GridLayout>
      </div>
    );
  }

  if (screenShareTrack) {
    return (
      <div
        className={[
          styles.speakerLayout,
          styles.speakerLayoutScreenShare,
          compact ? styles.speakerLayoutCompact : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.shareBanner}>
          {screenShareTrack.participant.name ||
            screenShareTrack.participant.identity}{" "}
          демонстрирует экран
        </div>

        <div className={styles.speakerMainScreenShare}>
          <FocusLayout
            trackRef={screenShareTrack}
            className={[styles.speakerMainTile, styles.speakerMainTileScreenShare]
              .filter(Boolean)
              .join(" ")}
          />
        </div>

        {filmstrip}
      </div>
    );
  }

  return (
    <div
      className={[
        styles.speakerLayout,
        compact ? styles.speakerLayoutCompact : "",
        styles.speakerLayoutStacked,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.speakerMain}>
        {focusTrack ? (
          <FocusLayout
            trackRef={focusTrack}
            className={styles.speakerMainTile}
          />
        ) : null}
      </div>

      {filmstrip}
    </div>
  );
}
