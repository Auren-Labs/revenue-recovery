export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  JPY: '¥',
  CHF: 'CHF',
};

export const formatCurrency = (
  amount: number,
  currencyCode: string = 'INR',
  options?: Intl.NumberFormatOptions
): string => {
  const symbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    ...options,
  }).format(amount);

  return `${symbol}${formatted}`;
};

