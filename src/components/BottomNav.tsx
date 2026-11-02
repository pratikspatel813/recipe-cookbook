"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The tab bar along the bottom of every screen, like Instagram's.
// Icons are drawn inline as SVG, so there's no icon library to install.

const TABS = [
  { href: "/", label: "Home", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/search", label: "Search", icon: SearchIcon, match: (p: string) => p.startsWith("/search") },
  { href: "/add", label: "Add", icon: AddIcon, match: (p: string) => p.startsWith("/add") },
  { href: "/ai", label: "AI Kitchen", icon: SparkleIcon, match: (p: string) => p.startsWith("/ai") },
  { href: "/profile", label: "Profile", icon: ProfileIcon, match: (p: string) => p.startsWith("/profile") },
];

export function BottomNav() {
  const pathname = usePathname();
  // The landing page has its own buttons into the app.
  if (pathname === "/welcome") return null;

  return (
    <nav
      aria-label="Main"
      // pb-[env(safe-area-inset-bottom)] keeps the bar above the iPhone home indicator.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] uppercase tracking-wider transition ${
                  active ? "text-accent" : "text-ink-soft hover:text-ink"
                }`}
              >
                <Icon filled={active} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type IconProps = { filled: boolean };
const iconProps = { width: 24, height: 24, viewBox: "0 0 24 24", strokeWidth: 1.6, stroke: "currentColor", "aria-hidden": true };

function HomeIcon({ filled }: IconProps) {
  return (
    <svg {...iconProps} fill={filled ? "currentColor" : "none"}>
      <path strokeLinejoin="round" d="M3.5 10.5 12 3.5l8.5 7V20a.5.5 0 0 1-.5.5h-5v-6h-6v6H4a.5.5 0 0 1-.5-.5z" />
    </svg>
  );
}

function SearchIcon({ filled }: IconProps) {
  return (
    <svg {...iconProps} fill="none" strokeWidth={filled ? 2.4 : 1.6}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path strokeLinecap="round" d="m15.5 15.5 5 5" />
    </svg>
  );
}

function AddIcon({ filled }: IconProps) {
  return (
    <svg {...iconProps} fill={filled ? "currentColor" : "none"}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path strokeLinecap="round" d="M12 8v8M8 12h8" stroke={filled ? "var(--page)" : "currentColor"} />
    </svg>
  );
}

function SparkleIcon({ filled }: IconProps) {
  return (
    <svg {...iconProps} fill={filled ? "currentColor" : "none"}>
      <path strokeLinejoin="round" d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5Z" />
      <path strokeLinecap="round" d="M18.5 15.5v4M16.5 17.5h4" />
    </svg>
  );
}

function ProfileIcon({ filled }: IconProps) {
  return (
    <svg {...iconProps} fill={filled ? "currentColor" : "none"}>
      <circle cx="12" cy="8.5" r="4" />
      <path strokeLinecap="round" d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </svg>
  );
}
