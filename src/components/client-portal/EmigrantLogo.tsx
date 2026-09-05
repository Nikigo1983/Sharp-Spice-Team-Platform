import Link from "next/link";
import {
  CLIENT_PORTAL_BRAND_NAME,
  CLIENT_PORTAL_LOGO_PATH,
} from "@/lib/client-portal/brand";
import styles from "./EmigrantLogo.module.css";

export type EmigrantLogoSize = "sm" | "md" | "lg" | "auth";

const DIMENSIONS: Record<EmigrantLogoSize, { width: number; height: number }> = {
  sm: { width: 140, height: 54 },
  md: { width: 180, height: 70 },
  lg: { width: 220, height: 86 },
  auth: { width: 240, height: 94 },
};

export function EmigrantLogo({
  size = "md",
  href,
  priority = false,
  className,
}: {
  size?: EmigrantLogoSize;
  href?: string;
  priority?: boolean;
  className?: string;
}) {
  const dims = DIMENSIONS[size];
  const mark = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={CLIENT_PORTAL_LOGO_PATH}
      alt={CLIENT_PORTAL_BRAND_NAME}
      width={dims.width}
      height={dims.height}
      className={[styles.image, styles[size], className].filter(Boolean).join(" ")}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );

  if (href) {
    return (
      <Link href={href} className={styles.link}>
        {mark}
      </Link>
    );
  }

  return mark;
}
