/** Official Spiora brand system (demo product). */

export const SPIORA_COLORS = {
  black: "#000000",
  red: "#E82916",
  orange: "#F4981A",
  page: "#0A0A0A",
  surface1: "#111111",
  surface2: "#1A1A1A",
  surface3: "#222222",
  white: "#FFFFFF",
  gray100: "#F5F5F5",
  gray400: "#B0B0B0",
  gray600: "#3A3A3A",
  gray800: "#1A1A1A",
  success: "#22C55E",
} as const;

export const SPIORA_GRADIENT =
  "linear-gradient(180deg, #F4981A 0%, #E82916 100%)";

export const SPIORA_GRADIENT_BRAND =
  "linear-gradient(135deg, #F4981A 0%, #E82916 100%)";

export const SPIORA_THEME = {
  mode: "dark" as const,
  themeColor: SPIORA_COLORS.red,
  backgroundColor: SPIORA_COLORS.black,
};

export const SPIORA_FONTS = {
  body: "Inter, system-ui, sans-serif",
  display: "Inter, system-ui, sans-serif",
  brand: "Raleway, Inter, sans-serif",
} as const;
