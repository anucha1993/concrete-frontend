/** Base API URL pointing to the Laravel backend */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

/** Cookie key for storing auth token */
export const TOKEN_KEY = 'stock_concrete_token';

/** Default pagination */
export const DEFAULT_PER_PAGE = 15;

/** App name */
export const APP_NAME = 'Stock Concrete';
