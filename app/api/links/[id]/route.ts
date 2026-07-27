import { NextResponse } from "next/server";
import { deleteLink, getLinkStatus, insertEvent, updateLink } from "@/lib/db";
import { getRoleFromRequest } from "@/lib/auth";
import type { LinkStatus, VisaBucket } from "@/lib/types";
import { STATUS_OPTIONS, VISA_LABEL } from "@/lib/types";

export const runtime = "nodejs";

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: {
    status?: LinkStatus;
    notes?: string | null;
    company?: string | null;
    title?: string | null;
    visa?: VisaBucket;
  } = {};
  if (typeof body.visa === "string" && body.visa in VISA_LABEL) {
    patch.visa = body.visa as VisaBucket;
  }
  if (typeof body.status === "string" && (STATUS_OPTIONS as string[]).includes(body.status)) {
    patch.status = body.status as LinkStatus;
  }
  if ("notes" in body) patch.notes = body.notes === null ? null : String(body.notes);
  if ("company" in body) patch.company = body.company === null ? null : String(body.company);
  if ("title" in body) patch.title = body.title === null ? null : String(body.title);

  // If status is changing, read the prior status BEFORE the update so we
  // can decide which event to log. A todo-bound transition is only a
  // 'restored' if the link was actually in a terminal state.
  let priorStatus: LinkStatus | null = null;
  if (patch.status) {
    priorStatus = await getLinkStatus(id);
  }

  const row = await updateLink(id, patch);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (patch.status) {
    if (patch.status === "todo") {
      // Restoring out of applied/dropped. No-op if the link was already todo.
      if (priorStatus === "applied" || priorStatus === "dropped") {
        await insertEvent(role, "restored", id);
      }
    } else {
      await insertEvent(role, patch.status, id);
    }
  }
  return NextResponse.json({ link: row });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await deleteLink(id);
  await insertEvent(role, "deleted", null);
  return NextResponse.json({ ok: true });
}
