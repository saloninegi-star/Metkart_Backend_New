const AppError = require("../lib/AppError");

/**
 * Lightweight in-memory circuit breaker and retry utility for external provider adapters.
 */
class CircuitBreaker {
  constructor(name, { failureThreshold = 5, resetTimeoutMs = 30000, callTimeoutMs = 10000 } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.callTimeoutMs = callTimeoutMs;
    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = 0;
  }

  async execute(fn, { retries = 0, isIdempotent = false } = {}) {
    const now = Date.now();
    if (this.state === "OPEN") {
      if (now - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
      } else {
        throw new AppError(
          "PROVIDER_UNAVAILABLE",
          502,
          `Provider ${this.name} is currently unavailable (circuit open)`
        );
      }
    }

    let attempt = 0;
    const maxAttempts = isIdempotent ? 1 + retries : 1;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new AppError("PROVIDER_UNAVAILABLE", 502, `Provider ${this.name} timed out`));
          }, this.callTimeoutMs);
        });

        const result = await Promise.race([fn(), timeoutPromise]);
        this.onSuccess();
        return result;
      } catch (err) {
        if (attempt >= maxAttempts) {
          this.onFailure();
          if (err instanceof AppError) throw err;
          throw new AppError("PROVIDER_UNAVAILABLE", 502, `Provider ${this.name} failed: ${err.message}`);
        }
        // Exponential backoff before retry
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  }

  onFailure() {
    this.failures += 1;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      console.warn(`[CircuitBreaker] Circuit for ${this.name} is now OPEN.`);
    }
  }
}

module.exports = CircuitBreaker;
