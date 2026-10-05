// Nút "Chỉ đường" (spec Q9): ưu tiên link Google Maps quán cấu hình (stores.google_maps_url, mig 090);
// chưa có thì tìm theo địa chỉ; không có cả hai thì ẩn nút. Chỉ chấp nhận https — không mở link lạ.
export function directionsUrl(mapsUrl: string | null | undefined, address: string | null | undefined): string | null {
  const link = (mapsUrl ?? "").trim();
  if (link.startsWith("https://")) return link;
  const place = (address ?? "").trim();
  if (!place) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}
