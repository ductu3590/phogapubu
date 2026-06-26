export interface RouteHandle {
  title?: string;
  back?: boolean;
  hideHeader?: boolean;
  hideBottomTabs?: boolean;
  hideCart?: boolean;
  headerPosition?: "fixed" | "sticky" | "static" | "relative";
}
