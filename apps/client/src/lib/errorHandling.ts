export class NetworkError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export async function parseHttpError(response: Response): Promise<NetworkError> {
  let message = response.statusText;

  try {
    const data = await response.json();
    if (data.error) {
      message = data.error;
    } else if (data.message) {
      message = data.message;
    }
  } catch {
    // Response body is not JSON.
  }

  return new NetworkError(message, response.status);
}
