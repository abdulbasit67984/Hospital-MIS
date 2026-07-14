export * from './api-response.js';
export * from './errors.js';
export * from './logger.js';
export * from './request-context.js';
export * from './security.js';

export async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle:
    | NodeJS.Timeout
    | undefined;

  const timeout =
    new Promise<never>(
      (
        _resolve,
        reject,
      ) => {
        timeoutHandle =
          setTimeout(
            () => {
              reject(
                new Error(
                  `${label} timed out after ${timeoutMs}ms`,
                ),
              );
            },

            timeoutMs,
          );
      },
    );

  try {
    return await Promise.race([
      task,
      timeout,
    ]);
  } finally {
    if (
      timeoutHandle !==
      undefined
    ) {
      clearTimeout(
        timeoutHandle,
      );
    }
  }
}