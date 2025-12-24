import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

function extFromMime(mime: string): string {
  // Basic mapping; fallback to .bin if unknown
  if (!mime) return ".bin";
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/jpg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/svg+xml") return ".svg";
  return ".bin";
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file field required (multipart/form-data)" }, { status: 400 });
    }

    const blob = file as File;
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Derive filename and extension
    const mime = blob.type || "";
    const originalName = (blob as any).name || "upload";
    const ext =
      originalName && originalName.includes(".")
        ? "." + originalName.split(".").pop()
        : extFromMime(mime);

    const filename = `${crypto.randomUUID()}${ext}`;

    // Save under /public/uploads
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    const destPath = path.join(uploadsDir, filename);
    await fs.writeFile(destPath, buffer);

    const url = `/uploads/${filename}`;
    return NextResponse.json({ url });
  } catch (e: any) {
    const msg = e?.message || String(e);
    try {
      console.error("/api/media/upload error:", msg);
    } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
