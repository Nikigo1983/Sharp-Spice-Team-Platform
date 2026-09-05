/** Client-facing Emigrant portal brand (separate from Sharp & Spice staff UI). */
export const CLIENT_PORTAL_BRAND_NAME = "Emigrant";

/** PNG for UI + email clients (SVG often blocked in mail). */
export const CLIENT_PORTAL_LOGO_PATH = "/emigrant-logo.png";

export const CLIENT_PORTAL_COLORS = {
  blue: "#2400FF",
  blueSoft: "#6B5CFF",
  blueMuted: "rgba(36, 0, 255, 0.12)",
  blueBorder: "rgba(36, 0, 255, 0.35)",
  ink: "#0f172a",
  muted: "#64748b",
  surface: "#f4f6fb",
  card: "#ffffff",
  line: "#e2e8f0",
} as const;
