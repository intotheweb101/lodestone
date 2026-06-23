import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getSyncLines } from '@/lib/sync-log';

export const dynamic = 'force-dynamic';

// SSE stream: sends new log lines every 1.5s until the client disconnects.
export function GET(req: NextRequest) {
  try { requireAdmin(req); } catch (e: unknown) {
    const err = e as { message: string; status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 403 });
  }

  const afterSeq = parseInt(req.nextUrl.searchParams.get('after') ?? '0', 10);

  const encoder = new TextEncoder();
  let seq = afterSeq;
  let timer: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      function send() {
        const { seq: newSeq, lines } = getSyncLines(seq);
        if (lines.length > 0) {
          const data = JSON.stringify({ seq: newSeq, lines });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          seq = newSeq;
        }
      }
      send();
      timer = setInterval(send, 1500);
    },
    cancel() {
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
