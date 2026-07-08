import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import type { Participant } from "livekit-client";
import { Track } from "livekit-client";

/** Up to this many cameras use an equal grid; above that, speaker + filmstrip. */
export const MEETING_GRID_MAX_PARTICIPANTS = 4;

export function pickCameraTracks(
  tracks: TrackReferenceOrPlaceholder[],
): TrackReferenceOrPlaceholder[] {
  return tracks.filter((track) => track.source === Track.Source.Camera);
}

export function pickScreenShareTrack(
  tracks: TrackReferenceOrPlaceholder[],
): TrackReferenceOrPlaceholder | undefined {
  return tracks.find((track) => track.source === Track.Source.ScreenShare);
}

export function resolveSpeakerFocusTrack(params: {
  cameraTracks: TrackReferenceOrPlaceholder[];
  screenShareTrack?: TrackReferenceOrPlaceholder;
  pinnedTrack?: TrackReferenceOrPlaceholder | null;
  activeSpeakers: Participant[];
  localParticipantIdentity: string;
}): TrackReferenceOrPlaceholder | null {
  if (params.screenShareTrack) {
    return params.screenShareTrack;
  }

  if (params.pinnedTrack) {
    return params.pinnedTrack;
  }

  for (const speaker of params.activeSpeakers) {
    const match = params.cameraTracks.find(
      (track) => track.participant.identity === speaker.identity,
    );
    if (match) {
      return match;
    }
  }

  const localTrack = params.cameraTracks.find(
    (track) => track.participant.identity === params.localParticipantIdentity,
  );

  return localTrack ?? params.cameraTracks[0] ?? null;
}

export function resolveSpeakerCarouselTracks(
  cameraTracks: TrackReferenceOrPlaceholder[],
  focusTrack: TrackReferenceOrPlaceholder | null,
): TrackReferenceOrPlaceholder[] {
  if (!focusTrack || focusTrack.source === Track.Source.ScreenShare) {
    return cameraTracks;
  }

  return cameraTracks.filter(
    (track) => track.participant.identity !== focusTrack.participant.identity,
  );
}
