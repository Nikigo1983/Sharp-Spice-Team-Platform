export function isGuestParticipantId(value: string): boolean {
  return value.startsWith("guest-");
}
