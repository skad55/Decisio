"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "./useSession";

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
};

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-lg px-3 py-2 text-sm ${
        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
    </a>
  );
}

export default function AppShell({ children, title }: AppShellProps) {
  const pathname = usePathname();
  const { isAuthenticated, logout } = useSession();

  const links = useMemo(
    () => [
      { href: "/", label: "Dashboard" },
      { href: "/sites", label: "Sites" },
      { href: "/imports", label: "Imports" },
      { href: "/login", label: "Login" },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold">{title || "Decisio"}</div>

          <div className="flex flex-wrap items-center gap-2">
            {links.map((l) => (
              <NavLink key={l.href} href={l.href} label={l.label} active={pathname === l.href} />
            ))}

            {isAuthenticated ? (
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => {
                  logout();
                  window.location.href = "/login";
                }}
              >
                Se déconnecter
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}