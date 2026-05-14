import { Outlet, useMatches } from "react-router-dom";
import Header from "./header";
import Footer from "./footer";
import CartFloatButton from "../common/cart-float-button";
import { useCartStore } from "@/stores/cart.store";

export default function Layout() {
  const matches = useMatches();
  const current = matches[matches.length - 1];
  const handle = current.handle as Record<string, unknown> | undefined;

  const hideFooter = handle?.hideFooter as boolean | undefined;
  const hideCart = handle?.hideCart as boolean | undefined;
  const hideHeader = handle?.hideHeader as boolean | undefined;
  const headerPosition = handle?.headerPosition as string | undefined;

  const { totalItems } = useCartStore();

  return (
    <div className="relative flex h-screen w-screen flex-col bg-[#F7F8FA]">
      {!hideHeader && (
        <Header
          title={handle?.title as string | undefined}
          back={handle?.back as boolean | undefined}
          position={headerPosition}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
      {!hideFooter && (
        <div className="relative shrink-0">
          <Footer />
          {!hideCart && <CartFloatButton itemCount={totalItems} />}
        </div>
      )}
    </div>
  );
}
