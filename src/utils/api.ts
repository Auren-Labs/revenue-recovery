/**
 * API utilities for error handling and retry logic
 */

export interface ApiError {
  message: string;
  status?: number;
  detail?: string;
}

/**
 * Parse API error response
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  try {
    const data = await response.json();
    return {
      message: data.detail || data.message || `Server error: ${response.status}`,
      status: response.status,
      detail: data.detail,
    };
  } catch {
    return {
      message: `Server error: ${response.status} ${response.statusText}`,
      status: response.status,
    };
  }
}

/**
 * Handle API errors with retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      // Retry on 5xx errors
      if (response.status >= 500 && attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        console.warn(`Request failed with ${response.status}, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on abort (timeout) or 4xx errors
      if (error.name === 'AbortError' || (error.response?.status && error.response.status < 500)) {
        throw lastError;
      }
      
      // Retry on network errors
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(`Network error, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

/**
 * Safe API call with error handling
 */
export async function safeApiCall<T>(
  url: string,
  options: RequestInit & { retries?: number; retryDelay?: number } = {}
): Promise<{ data: T | null; error: ApiError | null }> {
  const { retries, retryDelay, ...fetchOptions } = options;
  
  try {
    const response = await fetchWithRetry(
      url,
      fetchOptions,
      retries ?? 3,
      retryDelay ?? 1000
    );

    if (!response.ok) {
      const error = await parseApiError(response);
      return { data: null, error };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Unknown error occurred",
      },
    };
  }
}

