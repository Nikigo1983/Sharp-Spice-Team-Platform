import type { Metadata, Viewport } from "next";
import { SPIORA_COLORS, SPIORA_THEME } from "@/lib/spiora/branding";
import { SPIORA_SURVEY_STAFF_TITLE } from "@/lib/spiora-survey/schema";

export const metadata: Metadata = {
  title: `Исследование процессов · SPIORA`,
  description:
    "Короткое исследование рабочих процессов для продукта SPIORA.",
  themeColor: SPIORA_THEME.themeColor,
};

export const viewport: Viewport = {
  themeColor: SPIORA_COLORS.red,
  colorScheme: "dark",
};

export default function SpioraResearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
