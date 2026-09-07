import type { Metadata, Viewport } from "next";
import { SPIORA_COLORS, SPIORA_THEME } from "@/lib/spiora/branding";

export const metadata: Metadata = {
  title: "Анкета адаптации SPIORA",
  description: "Анкета адаптации платформы SPIORA под компанию.",
  themeColor: SPIORA_THEME.themeColor,
};

export const viewport: Viewport = {
  themeColor: SPIORA_COLORS.red,
  colorScheme: "dark",
};

export default function SpioraOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
