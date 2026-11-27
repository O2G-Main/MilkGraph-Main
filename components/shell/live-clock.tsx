"use client";

import { useSyncExternalStore } from "react";
import { Clock3 } from "lucide-react";
import { Icon } from "@/components/ui";

const timeZone = "Asia/Jakarta";
const timeFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone, weekday: "short", day: "numeric", month: "short",
});

function subscribe(onTick: () => void) {
  const interval = window.setInterval(onTick, 1000);
  document.addEventListener("visibilitychange", onTick);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onTick);
  };
}

const now = () => Math.floor(Date.now() / 1000) * 1000;
const serverSnapshot = () => null;

export function LiveClock() {
  const timestamp = useSyncExternalStore<number | null>(subscribe, now, serverSnapshot);
  const date = timestamp === null ? null : new Date(timestamp);
  const time = date ? timeFormat.format(date).replaceAll(".", ":") : "--:--:--";

  return (
    <time className="topbar-pill live-clock" data-tour="topbar" dateTime={date?.toISOString()}>
      <Icon icon={Clock3} size={16} />
      <span>{time} WIB</span>
      {date && <span className="clock-date">· {dateFormat.format(date)}</span>}
    </time>
  );
}
