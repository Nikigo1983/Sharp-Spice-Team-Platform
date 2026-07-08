import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { Track } from "livekit-client";
import {
  pickCameraTracks,
  pickScreenShareTrack,
  resolveSpeakerCarouselTracks,
  resolveSpeakerFocusTrack,
} from "./meeting-speaker-focus";

function track(
  identity: string,
  source: Track.Source = Track.Source.Camera,
): TrackReferenceOrPlaceholder {
  return {
    source,
    participant: { identity },
  } as TrackReferenceOrPlaceholder;
}

function speaker(identity: string) {
  return { identity } as Parameters<typeof resolveSpeakerFocusTrack>[0]["activeSpeakers"][number];
}

describe("meeting speaker focus", () => {
  it("picks camera and screen share tracks", () => {
    const tracks = [
      track("a"),
      track("b", Track.Source.ScreenShare),
      track("c"),
    ];

    assert.equal(pickCameraTracks(tracks).length, 2);
    assert.equal(pickScreenShareTrack(tracks)?.participant.identity, "b");
  });

  it("prioritizes screen share over active speaker", () => {
    const cameras = [track("a"), track("b")];
    const focus = resolveSpeakerFocusTrack({
      cameraTracks: cameras,
      screenShareTrack: track("share", Track.Source.ScreenShare),
      activeSpeakers: [speaker("b")],
      localParticipantIdentity: "a",
    });

    assert.equal(focus?.source, Track.Source.ScreenShare);
  });

  it("follows the loudest active speaker", () => {
    const cameras = [track("a"), track("b"), track("c")];
    const focus = resolveSpeakerFocusTrack({
      cameraTracks: cameras,
      activeSpeakers: [speaker("c"), speaker("a")],
      localParticipantIdentity: "a",
    });

    assert.equal(focus?.participant.identity, "c");
  });

  it("keeps all cameras in the filmstrip during screen share", () => {
    const cameras = [track("a"), track("b")];
    const carousel = resolveSpeakerCarouselTracks(
      cameras,
      track("share", Track.Source.ScreenShare),
    );

    assert.equal(carousel.length, 2);
  });

  it("hides the focused camera from the filmstrip", () => {
    const cameras = [track("a"), track("b"), track("c")];
    const carousel = resolveSpeakerCarouselTracks(cameras, track("b"));

    assert.deepEqual(
      carousel.map((item) => item.participant.identity),
      ["a", "c"],
    );
  });
});
