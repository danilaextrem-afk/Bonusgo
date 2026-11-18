export type IconName =
  | "cup" | "scissors" | "drop" | "star" | "heart" | "bag" | "fork" | "sparkle"
  | "check" | "qr" | "shield" | "chart" | "users" | "bolt" | "printer" | "phone" | "gift" | "lock" | "mail";

export const CARD_ICONS: { key: IconName; label: string }[] = [
  { key: "cup", label: "Чашка" },
  { key: "scissors", label: "Ножницы" },
  { key: "drop", label: "Капля" },
  { key: "star", label: "Звезда" },
  { key: "heart", label: "Сердце" },
  { key: "bag", label: "Покупка" },
];

const PATHS: Record<IconName, string> = {
  cup: "M5 8h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8zM16 9h2a2 2 0 0 1 0 4h-2M8 3.5v2M12 3.5v2M6 20h9",
  scissors: "M8 8.5 20 18M8 15.5 20 6M9 7.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM9 16.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  star: "m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  heart: "M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10z",
  bag: "M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2",
  fork: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1.5-3 4-3 7h3v11",
  sparkle: "m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16v4M17 18h4",
  check: "m5 12.5 4.5 4.5L19 7.5",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  shield: "M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6l-7-3zM9 12l2.2 2.2L15.5 10",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z",
  printer: "M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z",
  phone: "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7C10 7 8 6 8 4.5S10 3 12 7zM12 7c2 0 4-1 4-2.5S14 3 12 7z",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  mail: "M3 6h18v12H3zM3 7l9 6.5L21 7",
};

export function Icon({ name, size = 22, className, strokeWidth = 1.7 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
