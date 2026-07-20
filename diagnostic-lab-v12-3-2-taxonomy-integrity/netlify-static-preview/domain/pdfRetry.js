const TRANSIENT_PDF_ERROR = /(?:target closed|browser disconnected|session closed|target page, context or browser has been closed|execution context was destroyed|print document timed out|isolated print (?:document|window) could not be created)/i;

export function isTransientPdfError(error) {
  return TRANSIENT_PDF_ERROR.test(String(error?.message || error || ""));
}

export async function runWithSingleTransientPdfRetry(createAttempt, { onAttemptDisposed = () => {} } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let resource;
    try {
      resource = await createAttempt({ attempt });
      return { value: resource?.value ?? resource, attempts: attempt };
    } catch (error) {
      lastError = error;
      await safelyDispose(resource?.dispose);
      await onAttemptDisposed({ attempt, error });
      if (attempt === 2 || !isTransientPdfError(error)) throw error;
    }
  }
  throw lastError;
}

async function safelyDispose(dispose) {
  if (typeof dispose !== "function") return;
  try {
    await dispose();
  } catch {
    // Disposal must never hide the original PDF failure.
  }
}
