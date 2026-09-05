import Image from "next/image";
import Link from "next/link";
import {
  CLIENT_PORTAL_BRAND_NAME,
  CLIENT_PORTAL_LOGO_PATH,
} from "@/lib/client-portal/brand";
import styles from "./EmigrantLogo.module.css";

export type EmigrantLogoSize = "sm" | "md" | "lg" | "auth";

const DIMENSIONS: Record<EmigrantLogoSize, { width: number; height: number }> = {
  sm: { width: 120, height: 48 },
  md: { width: 160, height: 64 },
  lg: { width: 200, height: 80 },
  auth: { width: 220, height: 88 },
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
    <span
      className={[styles.frame, styles[size], className].filter(Boolean).join(" ")}
      style={{ width: dims.width, height: dims.height }}
    >
      <Image
        src={CLIENT_PORTAL_LOGO_PATH}
        alt={CLIENT_PORTAL_BRAND_NAME}
        width={dims.width}
        height={dims.height}
        className={styles.image}
        priority={priority}
      />
    </span>
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
