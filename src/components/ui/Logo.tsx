import Image from "next/image";
import Link from "next/link";
import { BRAND_NAME, LOGO_PATH } from "@/lib/brand";
import styles from "./Logo.module.css";

export type LogoSize = "sm" | "md" | "lg" | "auth" | "sidebar";

const LOGO_DIMENSIONS: Record<
  LogoSize,
  { width: number; height: number }
> = {
  sm: { width: 104, height: 32 },
  md: { width: 180, height: 44 },
  lg: { width: 220, height: 64 },
  auth: { width: 280, height: 88 },
  sidebar: { width: 252, height: 108 },
};

export type LogoProps = {
  showText?: boolean;
  href?: string;
  priority?: boolean;
  className?: string;
  size?: LogoSize;
};

export function LogoMark({
  priority = false,
  className,
  size = "md",
}: {
  priority?: boolean;
  className?: string;
  size?: LogoSize;
}) {
  const dims = LOGO_DIMENSIONS[size];
  const isSvg = LOGO_PATH.toLowerCase().endsWith(".svg");

  return (
    <span
      className={[styles.frame, styles[size], className].filter(Boolean).join(" ")}
      style={{ width: dims.width, height: dims.height }}
      aria-hidden={false}
    >
      {isSvg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={LOGO_PATH}
          alt={BRAND_NAME}
          width={dims.width}
          height={dims.height}
          className={styles.image}
          decoding="async"
        />
      ) : (
        <Image
          src={LOGO_PATH}
          alt={BRAND_NAME}
          width={dims.width}
          height={dims.height}
          className={styles.image}
          priority={priority}
        />
      )}
    </span>
  );
}

export function Logo({
  showText = false,
  href,
  priority = false,
  className,
  size = "md",
}: LogoProps) {
  const mark = <LogoMark priority={priority} size={size} />;

  const content = showText ? (
    <>
      {mark}
      <span className={styles.brandText}>
        Sharp <span className={styles.brandAmp}>&</span> Spice
      </span>
    </>
  ) : (
    mark
  );

  const rootClass = [
    showText ? styles.withText : styles.markOnly,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={rootClass}>
        {content}
      </Link>
    );
  }

  return <div className={rootClass}>{content}</div>;
}
