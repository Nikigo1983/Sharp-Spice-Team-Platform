"use client";

import { useLayoutEffect, type ReactNode } from "react";
import {
  useStaffChromeSetter,
  type StaffChromeOptions,
} from "./StaffAppChrome";

export type AppShellProps = StaffChromeOptions & {
  children: ReactNode;
  /** @deprecated Search change callbacks are unused; kept for API compatibility. */
  onSearchChange?: (value: string) => void;
};

/**
 * Registers page chrome options (title, content class) into the persistent StaffAppChrome.
 * Does not render a second sidebar — layout owns the shell.
 */
export function AppShell({
  children,
  sectionTitle,
  contentClassName,
  searchPlaceholder,
  defaultSearchValue,
}: AppShellProps) {
  const chrome = useStaffChromeSetter();

  useLayoutEffect(() => {
    if (!chrome) return;
    chrome.setOptions({
      sectionTitle,
      contentClassName,
      searchPlaceholder,
      defaultSearchValue,
    });
    return () => {
      chrome.setOptions({});
    };
  }, [
    chrome,
    sectionTitle,
    contentClassName,
    searchPlaceholder,
    defaultSearchValue,
  ]);

  return <>{children}</>;
}
