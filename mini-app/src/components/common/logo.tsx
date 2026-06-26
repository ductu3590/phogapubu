import logo from "@/static/logo.png";
import { copy } from "@/constants/copy";
import { useAppStore } from "@/stores/app.store";

export default function Logo() {
  // Ưu tiên logo quán (per-store); trống thì fallback logo MEVO
  const { storeLogoUrl, storeName } = useAppStore();
  return (
    <img
      src={storeLogoUrl || logo}
      alt={storeName || copy.brand.name}
      draggable={false}
      className="size-[22px] rounded-full object-cover"
    />
  );
}
