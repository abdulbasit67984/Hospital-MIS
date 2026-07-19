export interface RecoveryCycleResult {
  recovered:
    number;

  failed:
    number;
}

export interface RecoverableInfrastructure {
  markStaleTransactions(
    staleBefore:
      Date,
  ): Promise<number>;

  recoverAvailable(
    input: Readonly<{
      workerId:
        string;

      maxTransactions:
        number;

      now:
        Date;
    }>,
  ): Promise<RecoveryCycleResult>;
}

export interface RecoveryLoopLogger {
  info(
    bindings:
      Record<string, unknown>,

    message:
      string,
  ): void;

  error(
    bindings:
      Record<string, unknown>,

    message:
      string,
  ): void;
}

export interface StartedRecoveryLoop {
  run():
    Promise<void>;

  stop():
    void;
}

export interface StartRecoveryLoopOptions {
  name:
    string;

  workerId:
    string;

  recovery:
    RecoverableInfrastructure;

  logger:
    RecoveryLoopLogger;

  intervalMilliseconds?:
    number;

  staleAfterMilliseconds?:
    number;

  maxTransactions?:
    number;
}

export function startRecoveryLoop(
  options:
    StartRecoveryLoopOptions,
): StartedRecoveryLoop {
  const intervalMilliseconds =
    options.intervalMilliseconds ??
    15_000;

  const staleAfterMilliseconds =
    options.staleAfterMilliseconds ??
    5 * 60 * 1_000;

  const maxTransactions =
    options.maxTransactions ??
    20;

  if (
    !Number.isSafeInteger(
      intervalMilliseconds,
    ) ||
    intervalMilliseconds <=
      0
  ) {
    throw new TypeError(
      'Recovery interval must be a positive safe integer',
    );
  }

  if (
    !Number.isSafeInteger(
      staleAfterMilliseconds,
    ) ||
    staleAfterMilliseconds <=
      0
  ) {
    throw new TypeError(
      'Recovery stale duration must be a positive safe integer',
    );
  }

  if (
    !Number.isSafeInteger(
      maxTransactions,
    ) ||
    maxTransactions <=
      0
  ) {
    throw new TypeError(
      'Recovery maximum transactions must be a positive safe integer',
    );
  }

  let running =
    false;

  let stopped =
    false;

  const run =
    async (): Promise<void> => {
      if (
        running ||
        stopped
      ) {
        return;
      }

      running =
        true;

      try {
        const now =
          new Date();

        const staleBefore =
          new Date(
            now.getTime() -
            staleAfterMilliseconds,
          );

        const markedStale =
          await options.recovery
            .markStaleTransactions(
              staleBefore,
            );

        const result =
          await options.recovery
            .recoverAvailable({
              workerId:
                options.workerId,

              maxTransactions,

              now,
            });

        if (
          markedStale >
            0 ||
          result.recovered >
            0 ||
          result.failed >
            0
        ) {
          options.logger.info(
            {
              recoveryModule:
                options.name,

              markedStale,

              recovered:
                result.recovered,

              failed:
                result.failed,
            },

            `${options.name} recovery cycle completed`,
          );
        }
      } catch (error) {
        options.logger.error(
          {
            recoveryModule:
              options.name,

            error,
          },

          `${options.name} recovery cycle failed`,
        );
      } finally {
        running =
          false;
      }
    };

  const interval =
    setInterval(
      () => {
        void run();
      },

      intervalMilliseconds,
    );

  interval.unref();

  void run();

  return {
    run,

    stop() {
      stopped =
        true;

      clearInterval(
        interval,
      );
    },
  };
}