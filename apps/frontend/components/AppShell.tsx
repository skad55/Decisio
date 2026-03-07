"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./useSession";

type Props = {
  children: React.ReactNode;
};

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sites", label: "Sites" },
  { href: "/imports", label: "Imports" },
  { href: "/forecast", label: "Forecast" },
  { href: "/login", label: "Login" },
];

export default function AppShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, clearToken } = useSession();

  function logout() {
    clearToken();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/dashboard" className="font-semibold tracking-tight">
            Decisio
          </a>
          <nav className="flex items-center gap-1 text-sm">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 transition hover:bg-slate-100 ${
                  pathname === link.href ? "bg-slate-100" : ""
                }`}
              >
                {link.label}
              </a>
            ))}
            {isAuthenticated ? (
              <button
                onClick={logout}
                className="ml-2 rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50"
                type="button"
              >
                Logout
              </button>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}