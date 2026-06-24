/**
 * Email sending seam.
 * Uses Resend when RESEND_API_KEY is set; otherwise logs the link to the
 * server console (dev fallback — same gate as ALLOW_LOCAL_FALLBACK).
 *
 * Env vars:
 *   RESEND_API_KEY — Resend API key (https://resend.com)
 *   EMAIL_FROM     — e.g. "Lodestone <noreply@example.com>"
 *   APP_URL        — e.g. "https://lodestone.example.com" (no trailing slash)
 */

const FROM = process.env.EMAIL_FROM ?? 'Lodestone <noreply@lodestone.app>';

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY!;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

function logToConsole(to: string, subject: string, html: string): void {
  // Strip HTML tags for readability
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`\n📧 [DEV EMAIL]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
}

// ─── Price alert digest ───────────────────────────────────────────────────────

export interface TriggeredAlert {
  cardName: string;
  bestPriceNzd: number;
  targetNzd: number;
  finish: string;
  oracleId: string;
}

/**
 * Send a digest email summarising one or more triggered price alerts for a user.
 * Called once per user per sync run — one email, N cards.
 */
export async function sendPriceAlertDigest(
  to: string,
  alerts: TriggeredAlert[],
): Promise<void> {
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const subject =
    alerts.length === 1
      ? `Price alert: ${alerts[0].cardName} is now NZ$${alerts[0].bestPriceNzd.toFixed(2)}`
      : `${alerts.length} price alerts triggered on Lodestone`;

  const rows = alerts
    .map(a => {
      const cardUrl = `${appUrl}/card?q=${encodeURIComponent(a.cardName)}`;
      const saving = ((a.targetNzd - a.bestPriceNzd) / a.targetNzd * 100).toFixed(0);
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #1e3e3a">
            <a href="${cardUrl}" style="color:#e8b14a;text-decoration:none;font-weight:600">${a.cardName}</a>
            ${a.finish !== 'nonfoil' ? `<span style="font-size:11px;color:#5f7a76;margin-left:6px">(${a.finish})</span>` : ''}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e3e3a;color:#48c8a0;font-weight:700;font-family:monospace;text-align:right">
            NZ$${a.bestPriceNzd.toFixed(2)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e3e3a;color:#5f7a76;text-align:right;font-family:monospace">
            NZ$${a.targetNzd.toFixed(2)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e3e3a;color:#9bdb7a;text-align:right;font-size:12px">
            ${saving}% under
          </td>
        </tr>`;
    })
    .join('');

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#07151a;color:#eef3f0;border-radius:12px">
      <div style="margin-bottom:24px">
        <span style="font-size:13px;font-family:monospace;color:#e8b14a;letter-spacing:2px;font-weight:700">LODESTONE</span>
        <h2 style="color:#eef3f0;margin:10px 0 4px;font-size:20px">
          ${alerts.length === 1 ? 'Your price alert triggered' : `${alerts.length} price alerts triggered`}
        </h2>
        <p style="color:#5f7a76;margin:0;font-size:13px">
          ${alerts.length === 1 ? `${alerts[0].cardName} dropped below your target price.` : 'These cards dropped below your target prices.'}
        </p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr style="background:#0d2426">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#5f7a76;font-weight:600;letter-spacing:1px;text-transform:uppercase">Card</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#5f7a76;font-weight:600;letter-spacing:1px;text-transform:uppercase">Best price</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#5f7a76;font-weight:600;letter-spacing:1px;text-transform:uppercase">Your target</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#5f7a76;font-weight:600;letter-spacing:1px;text-transform:uppercase">Saving</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="text-align:center;margin:28px 0">
        <a href="${appUrl}/wishlist"
           style="background:#e8b14a;color:#0a1f22;font-weight:700;padding:13px 28px;border-radius:10px;text-decoration:none;font-size:14px;display:inline-block">
          View wishlist &amp; buy
        </a>
      </div>

      <p style="color:#2e5551;font-size:11px;line-height:1.6;margin:0">
        You set these alerts on Lodestone. To manage your alerts, visit
        <a href="${appUrl}/wishlist" style="color:#3a6a66">${appUrl}/wishlist</a>.
      </p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    await sendViaResend(to, subject, html);
  } else {
    logToConsole(to, subject, `${alerts.length} alert(s): ${alerts.map(a => `${a.cardName} @ NZ$${a.bestPriceNzd.toFixed(2)}`).join(', ')}`);
  }
}

/** Send a password-reset email with a one-click link. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const subject = 'Reset your Lodestone password';
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#07151a;color:#eef3f0;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:32px;font-family:serif">⚙</span>
        <h2 style="color:#e8b14a;margin:8px 0 0">Reset your password</h2>
      </div>
      <p style="color:#8aa39d;line-height:1.6">Someone (hopefully you) requested a password reset for your Lodestone account.</p>
      <p style="text-align:center;margin:32px 0">
        <a href="${resetUrl}"
           style="background:#e8b14a;color:#0a1f22;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;display:inline-block">
          Reset password
        </a>
      </p>
      <p style="color:#5f7a76;font-size:12px;line-height:1.6">
        This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
      <p style="color:#2e5551;font-size:11px;word-break:break-all;margin-top:16px">Or copy this link: ${resetUrl}</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    await sendViaResend(to, subject, html);
  } else {
    logToConsole(to, subject, `Reset link: ${resetUrl}`);
  }
}
