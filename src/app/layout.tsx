import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Busca Viral",
  description: "Encontre os vídeos mais virais do TikTok no seu nicho.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
