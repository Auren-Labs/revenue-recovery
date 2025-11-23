/**
 * Authentication utilities for managing user sessions
 */

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface Customer {
  id: string;
  name: string;
  subscription_tier: string;
}

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem("access_token");
  return !!token;
};

/**
 * Get access token
 */
export const getAccessToken = (): string | null => {
  return localStorage.getItem("access_token");
};

/**
 * Get current user
 */
export const getCurrentUser = (): User | null => {
  const userStr = localStorage.getItem("user");
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

/**
 * Get current customer
 */
export const getCurrentCustomer = (): Customer | null => {
  const customerStr = localStorage.getItem("customer");
  if (!customerStr) return null;
  try {
    return JSON.parse(customerStr);
  } catch {
    return null;
  }
};

/**
 * Logout user
 */
export const logout = (): void => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user");
  localStorage.removeItem("customer");
};

/**
 * Get authorization header for API requests
 */
export const getAuthHeader = (): Record<string, string> => {
  const token = getAccessToken();
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
};

