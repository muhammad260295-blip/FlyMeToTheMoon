import type { SearchApiError } from "./searchClient";

export type FriendlySearchError = {
  title: string;
  detail: string;
};

/** Maps API / transport errors to concise, user-facing copy. */
export function getFriendlySearchError(err: SearchApiError): FriendlySearchError {
  const { status, message, body } = err;

  if (status === 0) {
    return {
      title: "Can’t reach the server",
      detail:
        "Check your network connection. If you’re online, try again in a few seconds.",
    };
  }

  if (status === 400) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : null;
    return {
      title: "That search wasn’t valid",
      detail:
        msg ??
        "Use three-letter IATA airport codes and a date in YYYY-MM-DD format.",
    };
  }

  if (status === 429) {
    return {
      title: "Slow down a bit",
      detail:
        "You’ve sent a lot of searches in a short time. Wait a moment, then try again.",
    };
  }

  if (status === 502) {
    return {
      title: "Couldn’t load flights",
      detail:
        message.length > 0 && message !== "Invalid response from server"
          ? message
          : "The flight provider didn’t return usable results. Check your airports and date, then try again.",
    };
  }

  if (status === 503) {
    const notConfigured =
      typeof body === "object" &&
      body !== null &&
      (body as { error?: string }).error === "not_configured";
    if (notConfigured) {
      return {
        title: "Flight search isn’t configured",
        detail:
          message ||
          "Add SERPAPI_KEY to the backend .env file to run searches locally.",
      };
    }
    return {
      title: "Search is temporarily unavailable",
      detail:
        message ||
        "The service is busy or timing out. Please try again in a little while.",
    };
  }

  if (status === 504) {
    return {
      title: "Search timed out",
      detail: "The request took too long. Try again with a simpler search.",
    };
  }

  if (status >= 500) {
    return {
      title: "Server error",
      detail: "Something went wrong on our side. Try again in a few minutes.",
    };
  }

  return {
    title: "Search failed",
    detail:
      message.length > 0 && message !== "invalid_request"
        ? message
        : "Something went wrong. Try again.",
  };
}
