import "./globals.css";
import AppShell from "../components/AppShell";

export const metadata = {
  title: "Decisio",
  description: "Frontend V1 présentable",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}