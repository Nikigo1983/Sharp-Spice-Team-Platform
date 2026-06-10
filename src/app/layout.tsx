import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sharp & Spice",
  description: "Corporate AI Workspace for Sharp & Spice",
  applicationName: "Sharp & Spice",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Sharp & Spice",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.jpg", type: "image/jpeg" },
    ],
    apple: [{ url: "/icons/icon-192x192.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#910D0D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="ss-body">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
