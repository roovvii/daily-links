import { NextResponse } from "next/server";
import { createFaq, listFaqs } from "@/lib/db";
import { getRoleFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const faqs = await listFaqs();
  return NextResponse.json({ faqs });
}

export async function POST(req: Request) {
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (role !== "ravi") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
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
