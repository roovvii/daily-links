import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
];

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ALLOWED_TYPES,
        addRandomSuffix: true,
        maximumSizeInBytes: 15 * 1024 * 1024,
        tokenPayload: JSON.stringify({ pathname }),
      }),
      onUploadCompleted: async () => {
        // Auth middleware already gated this route. Nothing to record.
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
