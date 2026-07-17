import {
  spawn,
} from 'node:child_process';

const pnpmCommand =
  process.platform ===
  'win32'
    ? 'pnpm.cmd'
    : 'pnpm';

const child =
  spawn(
    pnpmCommand,
    [
      '--filter',
      '@hospital-mis/api',
      'seed:facility-configuration',
    ],
    {
      cwd:
        process.cwd(),

      env:
        process.env,

      stdio:
        'inherit',
    },
  );

const exitCode =
  await new Promise<number>(
    (
      resolve,
      reject,
    ) => {
      child.once(
        'error',
        reject,
      );

      child.once(
        'exit',
        (
          code,
          signal,
        ) => {
          if (
            signal !==
            null
          ) {
            reject(
              new Error(
                `Facility seed terminated by ${signal}`,
              ),
            );

            return;
          }

          resolve(
            code ??
              1,
          );
        },
      );
    },
  );

if (
  exitCode !==
  0
) {
  throw new Error(
    `Facility and configuration seed failed with exit code ${exitCode}`,
  );
}