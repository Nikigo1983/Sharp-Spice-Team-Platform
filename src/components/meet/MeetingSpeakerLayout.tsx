"use client";

import { useMemo, useState } from "react";
import type { ParticipantClickEvent } from "@livekit/components-core";
import { isTrackReference } from "@livekit/components-core";
import {
  CarouselLayout,
  FocusLayout,
  ParticipantTile,
  useLocalParticipant,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import {
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

  const focusTrack = useMemo(
    () =>
      resolveSpeakerFocusTrack({
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
    ],
  );

  const carouselTracks = useMemo(
    () => resolveSpeakerCarouselTracks(cameraTracks, focusTrack),
    [cameraTracks, focusTrack],
  );

  function handleCarouselParticipantClick(event: ParticipantClickEvent) {
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
          onParticipantClick={handleCarouselParticipantClick}
        />
      </CarouselLayout>
    </div>
  ) : null;

  return (
    <div
      className={[
        styles.speakerLayout,
        screenShareTrack ? styles.speakerLayoutScreenShare : "",
        compact ? styles.speakerLayoutCompact : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!screenShareTrack ? filmstrip : null}

      <div
        className={[
          styles.speakerMain,
          screenShareTrack ? styles.speakerMainScreenShare : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {focusTrack ? (
          <FocusLayout
            trackRef={focusTrack}
            className={[
              styles.speakerMainTile,
              screenShareTrack ? styles.speakerMainTileScreenShare : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ) : null}

        {screenShareTrack ? (
          <>
            <div className={styles.screenShareOverlay}>
              <div className={styles.shareBannerOverlay}>
                {screenShareTrack.participant.name ||
                  screenShareTrack.participant.identity}{" "}
                демонстрирует экран
              </div>
              {filmstrip}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
