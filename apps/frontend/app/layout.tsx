import "./globals.css";

export const metadata = {
  title: "Decisio",
  description: "Prévision de CA retail multi-sites (local demo)",
};

function TopNav() {
  return (
    <div className="border-b bg-white">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <div className="font-semibold tracking-tight">Decisio</div>
        <div className="flex items-center gap-4 text-sm">
          <a className="hover:underline" href="/">Dashboard</a>
          <a className="hover:underline" href="/sites">Sites</a>
          <a className="hover:underline" href="/imports">Imports</a>
          <a className="hover:underline" href="/login">Login</a>
        </div>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-slate-50 text-slate-900">
        <TopNav />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}