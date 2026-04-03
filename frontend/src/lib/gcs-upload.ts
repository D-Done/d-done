/**
 * GCS Resumable Upload client.
 *
 * The backend creates the resumable upload session and returns a session URI.
 * This module uploads the file to that session URI using XMLHttpRequest
 * (for real-time upload progress) with automatic retries on failure.
 *
 * Key design decisions:
 * - Uses XMLHttpRequest instead of fetch() because fetch() does NOT expose
 *   upload progress events.  XHR's `upload.onprogress` gives us byte-level
 *   progress tracking.
 * - Correctly treats HTTP 308 "Resume Incomplete" as a *success* signal for
 *   intermediate chunks (GCS uses 308 to acknowledge partial uploads).
 * - Falls back to offset-query on network failures and resumes from the last
 *   confirmed byte.
 *
 * @see https://cloud.google.com/storage/docs/resumable-uploads
 */

// ---- Configuration ----

/** Chunk size must be a multiple of 256 KiB (GCS requirement), except the last chunk. */
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1_000;

// ---- Types ----

export interface UploadProgress {
  /** Bytes uploaded so far */
  loaded: number;
  /** Total file size in bytes */
  total: number;
  /** Progress as a percentage 0–100 */
  percent: number;
}

export interface UploadCallbacks {
  /** Called periodically with upload progress */
  onProgress?: (progress: UploadProgress) => void;
  /** Called when upload completes successfully */
  onComplete?: () => void;
  /** Called on unrecoverable error */
  onError?: (error: Error) => void;
}

// ---- Helpers ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const jitter = 0.5 + Math.random();
  return INITIAL_BACKOFF_MS * Math.pow(2, attempt) * jitter;
}

/**
 * Returns true if the HTTP status warrants a retry.
 */
function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

// ---- XHR-based upload with progress ----

interface XhrResult {
  status: number;
  responseText: string;
  getHeader: (name: string) => string | null;
}

/**
 * Send a PUT request via XMLHttpRequest so we get `upload.onprogress` events.
 *
 * @param url           GCS session URI
 * @param body          The chunk (Blob) to upload
 * @param headers       Request headers (e.g. Content-Range)
 * @param onProgress    Called with (loaded, total) during upload
 * @param abortSignal   Optional AbortSignal to cancel the request
 */
function xhrPut(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void,
  abortSignal?: AbortSignal,
): Promise<XhrResult> {
  return new Promise<XhrResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);

    // Set headers
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    // Progress tracking — this is the whole reason we use XHR
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded, event.total);
        }
      };
    }

    xhr.onload = () => {
      resolve({
        status: xhr.status,
        responseText: xhr.responseText,
        getHeader: (name: string) => xhr.getResponseHeader(name),
      });
    };

    xhr.onerror = () => {
      reject(new TypeError("Network error during upload"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload request timed out"));
    };

    // Wire up AbortSignal
    if (abortSignal) {
      if (abortSignal.aborted) {
        xhr.abort();
        reject(new Error("Upload aborted"));
        return;
      }
      abortSignal.addEventListener("abort", () => {
        xhr.abort();
        reject(new Error("Upload aborted"));
      });
    }

    xhr.send(body);
  });
}

// ---- Upload ----

/**
 * Upload a file to GCS using a resumable session URI.
 *
 * - For files <= CHUNK_SIZE: single PUT with full-body progress tracking
 * - For files > CHUNK_SIZE: chunked PUT with Content-Range headers
 * - Correctly handles GCS 308 "Resume Incomplete" responses
 * - Automatically retries on network errors or 5xx/408 from GCS
 * - Reports real-time byte-level progress via callbacks
 */
export async function uploadFile(
  sessionUri: string,
  file: File,
  callbacks?: UploadCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const totalSize = file.size;

  callbacks?.onProgress?.({ loaded: 0, total: totalSize, percent: 0 });

  try {
    if (totalSize <= CHUNK_SIZE) {
      await uploadSingleRequest(sessionUri, file, totalSize, callbacks, abortSignal);
    } else {
      await uploadChunked(sessionUri, file, totalSize, callbacks, abortSignal);
    }
    callbacks?.onComplete?.();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    callbacks?.onError?.(error);
    throw error;
  }
}

// ---- Single-request upload (file <= CHUNK_SIZE) ----

async function uploadSingleRequest(
  sessionUri: string,
  file: File,
  totalSize: number,
  callbacks?: UploadCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (abortSignal?.aborted) throw new Error("Upload aborted");

    try {
      const res = await xhrPut(
        sessionUri,
        file,
        {}, // No Content-Range for single-request upload
        (loaded) => {
          const percent = Math.round((loaded / totalSize) * 100);
          callbacks?.onProgress?.({ loaded, total: totalSize, percent });
        },
        abortSignal,
      );

      // 200/201 = upload complete
      if (res.status === 200 || res.status === 201) {
        callbacks?.onProgress?.({ loaded: totalSize, total: totalSize, percent: 100 });
        return;
      }

      // 308 = GCS received partial data on what should have been a full upload.
      // Query the offset and fall back to chunked resume.
      if (res.status === 308) {
        const confirmedOffset = parseRangeHeader(res.getHeader("Range"));
        await resumeChunked(
          sessionUri,
          file,
          totalSize,
          confirmedOffset,
          callbacks,
          abortSignal,
        );
        return;
      }

      // Retryable server error
      if (isRetryable(res.status)) {
        if (attempt < MAX_RETRIES - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new Error(`Upload failed after ${MAX_RETRIES} retries (HTTP ${res.status})`);
      }

      // Non-retryable error
      throw new Error(`Upload failed (HTTP ${res.status}): ${res.responseText}`);
    } catch (err) {
      if (abortSignal?.aborted) throw new Error("Upload aborted");

      if (err instanceof TypeError) {
        // Network error — retry
        if (attempt < MAX_RETRIES - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
      throw err;
    }
  }
}

// ---- Chunked upload (file > CHUNK_SIZE) ----

async function uploadChunked(
  sessionUri: string,
  file: File,
  totalSize: number,
  callbacks?: UploadCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  let uploadedBytes = 0;

  while (uploadedBytes < totalSize) {
    if (abortSignal?.aborted) throw new Error("Upload aborted");

    const start = uploadedBytes;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = file.slice(start, end);
    const contentRange = `bytes ${start}-${end - 1}/${totalSize}`;

    let chunkSent = false;

    for (let attempt = 0; attempt < MAX_RETRIES && !chunkSent; attempt++) {
      if (abortSignal?.aborted) throw new Error("Upload aborted");

      try {
        const res = await xhrPut(
          sessionUri,
          chunk,
          { "Content-Range": contentRange },
          (loaded) => {
            // Report progress: already-uploaded bytes + bytes sent in this chunk
            const totalLoaded = start + loaded;
            const percent = Math.round((totalLoaded / totalSize) * 100);
            callbacks?.onProgress?.({
              loaded: totalLoaded,
              total: totalSize,
              percent: Math.min(percent, 100),
            });
          },
          abortSignal,
        );

        // --- Success conditions ---
        // 200/201 = entire upload is complete (last chunk or GCS confirmed all bytes)
        if (res.status === 200 || res.status === 201) {
          uploadedBytes = totalSize;
          callbacks?.onProgress?.({ loaded: totalSize, total: totalSize, percent: 100 });
          chunkSent = true;
          break;
        }

        // 308 = GCS acknowledges this chunk and is ready for the next one.
        // This is the EXPECTED response for non-last chunks.
        // It can also come on the "last" chunk if GCS didn't receive all bytes.
        if (res.status === 308) {
          const confirmedOffset = parseRangeHeader(res.getHeader("Range"));
          uploadedBytes = confirmedOffset;
          callbacks?.onProgress?.({
            loaded: uploadedBytes,
            total: totalSize,
            percent: Math.round((uploadedBytes / totalSize) * 100),
          });
          chunkSent = true;
          break;
        }

        // Retryable
        if (isRetryable(res.status)) {
          if (attempt < MAX_RETRIES - 1) {
            await sleep(backoffMs(attempt));
            // Re-query the offset so we don't re-send bytes already confirmed
            uploadedBytes = await queryUploadOffset(sessionUri, totalSize);
            break; // break inner retry loop → outer while loop recalculates chunk
          }
          throw new Error(`Upload chunk failed after ${MAX_RETRIES} retries (HTTP ${res.status})`);
        }

        // Non-retryable error
        throw new Error(`Upload chunk failed (HTTP ${res.status}): ${res.responseText}`);
      } catch (err) {
        if (abortSignal?.aborted) throw new Error("Upload aborted");

        if (err instanceof TypeError) {
          // Network error
          if (attempt < MAX_RETRIES - 1) {
            await sleep(backoffMs(attempt));
            try {
              uploadedBytes = await queryUploadOffset(sessionUri, totalSize);
            } catch {
              /* keep current offset */
            }
            break; // break inner retry → outer while recalculates chunk
          }
        }
        throw err;
      }
    }
  }
}

/**
 * Resume a partial upload in chunked mode starting from a confirmed offset.
 * Used when a single-request upload returns 308 (partial receipt).
 */
async function resumeChunked(
  sessionUri: string,
  file: File,
  totalSize: number,
  startOffset: number,
  callbacks?: UploadCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  let uploadedBytes = startOffset;

  while (uploadedBytes < totalSize) {
    if (abortSignal?.aborted) throw new Error("Upload aborted");

    const start = uploadedBytes;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = file.slice(start, end);
    const contentRange = `bytes ${start}-${end - 1}/${totalSize}`;

    const res = await xhrPut(
      sessionUri,
      chunk,
      { "Content-Range": contentRange },
      (loaded) => {
        const totalLoaded = start + loaded;
        const percent = Math.round((totalLoaded / totalSize) * 100);
        callbacks?.onProgress?.({
          loaded: totalLoaded,
          total: totalSize,
          percent: Math.min(percent, 100),
        });
      },
      abortSignal,
    );

    if (res.status === 200 || res.status === 201) {
      callbacks?.onProgress?.({ loaded: totalSize, total: totalSize, percent: 100 });
      return;
    }

    if (res.status === 308) {
      uploadedBytes = parseRangeHeader(res.getHeader("Range"));
      continue;
    }

    throw new Error(`Resume upload failed (HTTP ${res.status}): ${res.responseText}`);
  }
}

// ---- Query upload offset (for resume after failure) ----

/**
 * Ask GCS how many bytes it has received so far for this session.
 * Uses an empty PUT with `Content-Range: bytes * /total` — GCS responds with
 * 308 and a `Range` header indicating the confirmed byte range.
 */
async function queryUploadOffset(
  sessionUri: string,
  totalSize: number,
): Promise<number> {
  const res = await xhrPut(
    sessionUri,
    new Blob(), // empty body
    { "Content-Range": `bytes */${totalSize}` },
  );

  if (res.status === 308) {
    return parseRangeHeader(res.getHeader("Range"));
  }
  // 200/201 means the upload is actually complete
  if (res.status === 200 || res.status === 201) {
    return totalSize;
  }
  // Unknown state — start from 0 to be safe
  return 0;
}

/**
 * Parse the GCS `Range: bytes=0-N` header and return the next byte offset.
 * Returns 0 if the header is missing or unparsable.
 */
function parseRangeHeader(rangeHeader: string | null): number {
  if (!rangeHeader) return 0;
  const match = rangeHeader.match(/bytes=0-(\d+)/);
  if (match) return parseInt(match[1], 10) + 1;
  return 0;
}
