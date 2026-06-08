"use client";

import { useEffect } from "react";
import styles from "./Toast.module.css";

export type ToastMessage = {
  text: string;
  type?: "success" | "error";
};

export function Toast({
  message,
  onClose,
}: {
  message: ToastMessage | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 3200);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div
      className={[
        styles.toast,
        message.type === "error" ? styles.error : styles.success,
      ].join(" ")}
      role="status"
    >
      {message.text}
    </div>
  );
}
