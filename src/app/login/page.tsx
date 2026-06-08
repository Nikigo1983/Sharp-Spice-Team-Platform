import { redirect } from "next/navigation";
import { DemoCredentials } from "@/components/auth/DemoCredentials";
import { LoginForm } from "@/components/auth/LoginForm";
import { Logo } from "@/components/ui/Logo";
import { getSession } from "@/lib/auth/session";
import styles from "./login.module.css";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

/** Запасные стили, если встроенный браузер не подгрузил CSS-модули */
const pageFallback = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
  background:
    "linear-gradient(168deg, #0f141c 0%, #141b26 42%, #1a202c 100%)",
  color: "#ffffff",
  fontFamily: "Inter, system-ui, sans-serif",
} as const;

const cardFallback = {
  width: "100%",
  maxWidth: "440px",
  padding: "2rem",
  background: "#2d3748",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "24px",
  boxShadow: "0 16px 35px rgba(0, 0, 0, 0.22)",
  textAlign: "center" as const,
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") ? params.next : undefined;

  return (
    <div className={styles.page} style={pageFallback}>
      <div className={styles.card} style={cardFallback}>
        <div className={styles.logoWrap}>
          <Logo priority size="lg" />
        </div>
        <h1 className={styles.title} style={{ color: "#fff", margin: 0 }}>
          Sharp & Spice
        </h1>
        <p className={styles.subtitle} style={{ color: "#cbd5e0" }}>
          Вход в корпоративную платформу
        </p>
        <LoginForm nextPath={nextPath} />
        {process.env.NODE_ENV !== "production" ? <DemoCredentials /> : null}
      </div>
    </div>
  );
}
