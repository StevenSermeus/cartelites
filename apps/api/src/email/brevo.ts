export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Uint8Array }[];
};

type BrevoConfig = { apiKey: string; fromEmail: string; fromName?: string };

// Keep provider response bodies out of errors: they may contain personal data.
export class EmailDeliveryError extends Error {
  constructor(
    public readonly status?: number,
    public readonly reason = 'network_error',
  ) {
    super(status ? `BREVO_DELIVERY_FAILED (${status})` : 'BREVO_DELIVERY_FAILED');
  }
}

export async function sendBrevoEmail(
  config: BrevoConfig,
  message: EmailMessage,
  fetcher: typeof fetch = fetch,
): Promise<{ messageId: string }> {
  if (!config.apiKey || !config.fromEmail) throw new Error('EMAIL_DELIVERY_UNAVAILABLE');
  let response: Response;
  try {
    response = await fetcher('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        sender: { email: config.fromEmail, ...(config.fromName ? { name: config.fromName } : {}) },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        ...(message.text ? { textContent: message.text } : {}),
        ...(message.attachments?.length
          ? {
              attachment: message.attachments.map((file) => ({
                name: file.filename,
                content: Buffer.from(file.content).toString('base64'),
              })),
            }
          : {}),
      }),
    });
  } catch {
    throw new EmailDeliveryError();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    const message = String(body.message ?? '').toLowerCase();
    const reason =
      /ip/.test(message) && /unauthor|unrecogn|not.*allow/.test(message)
        ? 'unauthorized_ip'
        : /not.*activat|suspend|account.*block/.test(message)
          ? 'account_inactive'
          : /sender|from.*email/.test(message)
            ? 'sender_invalid'
            : /credit|quota|limit/.test(message) || response.status === 429
              ? 'quota_exceeded'
              : /permission|access denied/.test(message)
                ? 'permission_denied'
                : response.status === 401
                  ? 'invalid_key'
                  : /recipient|email.*invalid|invalid.*email/.test(message)
                    ? 'recipient_invalid'
                    : 'provider_error';
    throw new EmailDeliveryError(response.status, reason);
  }
  const result: unknown = await response.json().catch(() => null);
  if (
    !result ||
    typeof result !== 'object' ||
    !('messageId' in result) ||
    typeof result.messageId !== 'string' ||
    !result.messageId
  ) {
    throw new EmailDeliveryError();
  }
  // Accepted by Brevo, not proof of delivery to the recipient.
  return { messageId: result.messageId };
}
