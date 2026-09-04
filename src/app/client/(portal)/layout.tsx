import type { ReactNode } from "react";

export default function ClientPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface-hero, #0b0b0b)",
        color: "var(--white, #fff)",
      }}
    >
      {children}
    </div>
  );
}
