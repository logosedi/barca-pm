import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BARCA PM", template: "%s · BARCA PM" },
  description: "Gestão de projetos para times multidisciplinares.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
