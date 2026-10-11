import "./estilo.css";

export const metadata = { title: "DinoMoney", description: "Seu fluxo de caixa organizado pela Fôlego" };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#1f7a4d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
