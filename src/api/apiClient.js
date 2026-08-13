import { mongolianErrorMessage } from "../errors/errorMessages.js";

export const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = 15000;

let accessToken = null;
let refreshPromise = null;
let sessionExpiredHandler = null;
const inflightGetRequests = new Map();
const responseCache = new Map();

function wait(ms) {
  return new Promise(resolve => globalThis.setTimeout(resolve, ms));
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = "REQUEST_FAILED", requestId = null, details = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export function setAccessToken(token) {
  const next = token || null;
  if (next !== accessToken) responseCache.clear();
  accessToken = next;
}

export function invalidateApiCache(prefix = "") {
  for (const key of responseCache.keys()) {
    if (!prefix || key.includes(prefix)) responseCache.delete(key);
  }
}

export function getAccessToken() {
  return accessToken;
}

export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = typeof handler === "function" ? handler : null;
}

export function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  }
  throw new ApiError("Аюулгүй хүсэлтийн identifier үүсгэж чадсангүй.", { code: "SECURE_RANDOM_UNAVAILABLE" });
}

function createRequestSignal(signal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const abort = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}

async function parsePayload(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json().catch(() => null);
  return response.text().catch(() => "");
}

function toApiError(response, payload) {
  const serverError = payload && typeof payload === "object" ? payload.error : null;
  const errorLike = { status: response.status, code: serverError?.code, message: serverError?.message };
  return new ApiError(
    mongolianErrorMessage(errorLike, response.status === 401 ? "Нэвтрэх хугацаа дууссан байна." : `Серверийн хүсэлт амжилтгүй боллоо (${response.status}).`),
    {
      status: response.status,
      code: serverError?.code || "REQUEST_FAILED",
      requestId: serverError?.requestId || response.headers.get("x-request-id"),
      details: serverError?.details,
    },
  );
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const payload = await parsePayload(response);
      if (!response.ok || !payload?.accessToken) throw toApiError(response, payload);
      setAccessToken(payload.accessToken);
      return payload;
    })().catch(error => {
      setAccessToken(null);
      sessionExpiredHandler?.(error);
      throw error;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function performApiRequest(path, options = {}) {
  const {
    auth = true,
    retryAuth = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    responseType = "payload",
    signal,
    headers,
    idempotencyKey,
    cacheTtlMs: _cacheTtlMs,
    dedupe: _dedupe,
    cacheKey: _cacheKey,
    ...fetchOptions
  } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const requestIdempotencyKey = idempotencyKey || (method === "POST" ? createIdempotencyKey() : null);
  const requestSignal = createRequestSignal(signal, timeoutMs);
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      credentials: "include",
      signal: requestSignal.signal,
      headers: {
        Accept: "application/json",
        ...(fetchOptions.body && !(fetchOptions.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(requestIdempotencyKey ? { "Idempotency-Key": requestIdempotencyKey } : {}),
        ...headers,
      },
    });
  } catch (cause) {
    if (cause?.name === "AbortError" || cause?.name === "TimeoutError" || requestSignal.signal.aborted) {
      throw new ApiError("Сервер хариу өгөх хугацаа хэтэрлээ.", { code: "REQUEST_TIMEOUT", cause });
    }
    throw new ApiError("Backend сервертэй холбогдож чадсангүй. Сүлжээ болон серверээ шалгана уу.", { code: "NETWORK_ERROR", cause });
  } finally {
    requestSignal.dispose();
  }

  if (response.status === 401 && auth && retryAuth) {
    await refreshAccessToken();
    return performApiRequest(path, { ...options, retryAuth: false, idempotencyKey: requestIdempotencyKey });
  }
  if (responseType === "response" && response.ok) return response;
  const payload = await parsePayload(response);
  if (!response.ok) throw toApiError(response, payload);
  return payload;
}

export async function apiRequest(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const transientRetries = options.signal ? 0 : Math.max(0, Number(options.transientRetries ?? (["GET", "HEAD"].includes(method) ? 2 : 0)));
  const cacheTtlMs = Math.max(0, Number(options.cacheTtlMs || 0));
  const canDedupe = method === "GET" && options.dedupe !== false && !options.signal && options.responseType !== "response";
  const identity = options.auth === false ? "public" : `auth:${accessToken ? "session" : "anonymous"}`;
  const key = options.cacheKey || `${identity}:${method}:${path}`;

  if (method === "GET" && cacheTtlMs > 0) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) responseCache.delete(key);
  }
  if (canDedupe && inflightGetRequests.has(key)) return inflightGetRequests.get(key);

  const execute = async () => {
    let attempt = 0;
    while (true) {
      try {
        return await performApiRequest(path, options);
      } catch (error) {
        const transient = error?.code === "NETWORK_ERROR" || error?.code === "REQUEST_TIMEOUT" || [502, 503, 504].includes(error?.status);
        if (!transient || attempt >= transientRetries) throw error;
        attempt += 1;
        await wait(250 * (2 ** (attempt - 1)));
      }
    }
  };

  const promise = execute().then(payload => {
    if (method === "GET" && cacheTtlMs > 0) responseCache.set(key, { value: payload, expiresAt: Date.now() + cacheTtlMs });
    if (!["GET", "HEAD"].includes(method)) invalidateApiCache();
    return payload;
  }).finally(() => {
    if (canDedupe) inflightGetRequests.delete(key);
  });

  if (canDedupe) inflightGetRequests.set(key, promise);
  return promise;
}

export async function restoreAccessSession() {
  return refreshAccessToken();
}
