/** Spiora product hub inside Sharp & Spice. */
import { SPIORA_COLORS } from "./branding";

export const SPIORA_PRODUCT_NAME = "SPIORA";

export const SPIORA_SLOGAN = "ONE PLATFORM. INFINITE SOLUTIONS.";

export const SPIORA_DESCRIPTION =
  "AI-операционная система для бизнеса — демонстрационная корпоративная платформа для показа клиентам.";

/** Brand mark for dark Spiora surfaces (white letters + gradient O/A). */
export const SPIORA_LOGO_PATH = "/spiora-logo.svg";

/** Primary Spiora accent. */
export const SPIORA_ACCENT = SPIORA_COLORS.red;

/** Public demo URL. Override with NEXT_PUBLIC_SPIORA_URL. */
export function getSpioraDemoUrl(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_SPIORA_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return null;
}

export const SPIORA_HIGHLIGHTS = [
  {
    title: "Командная работа",
    text: "Задачи, календарь, чат и видеовстречи в одной среде.",
  },
  {
    title: "Клиентский контур",
    text: "Приглашения, анкеты, статусы дела и финансы для демо-сценариев.",
  },
  {
    title: "AI Workspace",
    text: "Ассистент для менеджеров на вымышленных, безопасных данных.",
  },
  {
    title: "Демо без риска",
    text: "Изолирована от production Sharp & Spice и реальных клиентов.",
  },
] as const;

export {
  SPIORA_COLORS,
  SPIORA_FONTS,
  SPIORA_GRADIENT,
  SPIORA_GRADIENT_BRAND,
  SPIORA_THEME,
} from "./branding";
