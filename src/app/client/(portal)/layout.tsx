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
        background:
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(36, 0, 255, 0.1), transparent 55%), linear-gradient(180deg, #f4f6fb 0%, #eef1f8 100%)",
        color: "#0f172a",
      }}
    >
      {children}
    </div>
  );
}
