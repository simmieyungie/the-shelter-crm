import "server-only";

/** Stub mailer. Email delivery is not part of v1; links are written to the server log. */
export async function sendEmail(to: string, subject: string, text: string) {
  console.info(`[mail] to=${to} subject="${subject}"\n${text}`);
}
