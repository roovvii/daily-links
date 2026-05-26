import { NextResponse } from "next/server";
import { createFaq, listFaqs } from "@/lib/db";
import { getRoleFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const faqs = await listFaqs();
  return NextResponse.json({ faqs });
}

export async function POST(req: Request) {
  // FAQs are a shared scratchpad both roles maintain together, so any
  // authenticated user can add. The middleware already enforces auth on
  // /api/* routes; we only need the role lookup to confirm a valid session.
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!question || !answer) {
    return NextResponse.json(
      { error: "question and answer are required" },
      { status: 400 }
    );
  }
  const faq = await createFaq(question, answer);
  return NextResponse.json({ faq });
}
