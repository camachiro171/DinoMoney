import { NextResponse } from "next/server";
import { COOKIE_SESSAO } from "@/lib/sessao";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_SESSAO);
  return res;
}
