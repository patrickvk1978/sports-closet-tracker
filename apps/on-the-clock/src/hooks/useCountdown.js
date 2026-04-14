import { useEffect, useState } from "react";

// 2026 NFL Draft — Thursday April 23, 8:00 PM ET
const DRAFT_START = new Date("2026-04-23T20:00:00-04:00");

function pad(n) {
  return String(n).padStart(2, "0");
}

export function useCountdown() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = DRAFT_START.getTime() - now;

  if (diff <= 0) {
    return { expired: true, label: "DRAFT IS LIVE", days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let label;
  if (days > 0) {
    label = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  } else {
    label = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return { expired: false, label, days, hours, minutes, seconds };
}
