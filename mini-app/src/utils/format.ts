const DEFAULT_LOCALE = "vi-VN";

export const formatCurrency = (
  value: number,
  locale: string = DEFAULT_LOCALE,
) => `${value.toLocaleString(locale)}`;
