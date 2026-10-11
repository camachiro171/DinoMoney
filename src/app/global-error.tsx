"use client";

import Erro from "./error";
import "./estilo.css";

export default function ErroGeral(props: { error: Error & { digest?: string } }) {
  return (
    <html lang="pt-BR">
      <body>
        <Erro {...props} />
      </body>
    </html>
  );
}
