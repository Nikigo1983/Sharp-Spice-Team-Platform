import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sharp & Spice",
  description: "Корпоративная платформа Sharp & Spice",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="ss-body">{children}</body>
    </html>
  );
}
