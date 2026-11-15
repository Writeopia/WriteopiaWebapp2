/** The backend answered, with a status that is not a success. */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    message: string,
    /** The body of the answer, as text. */
    readonly body = "",
  ) {
    super(message);
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

/** The backend could not be reached: no connection, a timeout, or the request was aborted. */
export class NetworkError extends Error {
  override readonly name = "NetworkError";

  constructor(
    message: string,
    /** True when the request took longer than its timeout. */
    readonly timedOut = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** The backend answered with a success, but not with the shape this app expects. */
export class ApiParseError extends Error {
  override readonly name = "ApiParseError";

  constructor(
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`Unexpected response from ${path}`, options);
  }
}
