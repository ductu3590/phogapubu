// Sinh mini-app/src/components/common/icons.tsx từ dữ liệu lucide của admin-web (cùng bộ icon, không thêm dependency).
const fs = require('fs')
const path = require('path')
// Chạy từ gốc repo: node scripts/gen-mini-app-icons.cjs (cần admin-web/node_modules đã cài).
const ROOT = path.resolve(__dirname, '..')
const ICON_DIR = path.join(ROOT, 'admin-web/node_modules/lucide-react/dist/esm/icons')
const OUT = path.join(ROOT, 'mini-app/src/components/common/icons.tsx')
const NAMES = {
  Bike: 'bike', Lock: 'lock', Bell: 'bell', Armchair: 'armchair', Layers: 'layers', Moon: 'moon',
  CircleAlert: 'circle-alert', Utensils: 'utensils', Ticket: 'ticket', User: 'user', Gift: 'gift',
  Footprints: 'footprints', TriangleAlert: 'triangle-alert', CreditCard: 'credit-card', Banknote: 'banknote',
  Hourglass: 'hourglass', CircleCheck: 'circle-check', ChefHat: 'chef-hat', CircleX: 'circle-x', MapPin: 'map-pin',
  RotateCw: 'rotate-cw', PartyPopper: 'party-popper', Clock: 'clock', Landmark: 'landmark',
  ClipboardList: 'clipboard-list', Package: 'package', ScanLine: 'scan-line', Phone: 'phone', Wifi: 'wifi',
  FileText: 'file-text', MessageCircle: 'message-circle',
  ShoppingCart: 'shopping-cart', Heart: 'heart', Search: 'search', ChevronLeft: 'chevron-left',
  Plus: 'plus', Minus: 'minus', ArrowRight: 'arrow-right', CalendarDays: 'calendar-days', Users: 'users',
}
const out = []
out.push(`// Icon dùng trong Mini App — đường vẽ lấy từ lucide (ISC license, https://lucide.dev), CÙNG bộ icon với admin-web.
// File SINH TỰ ĐỘNG bởi scripts/gen-mini-app-icons.cjs — thêm icon thì thêm tên vào NAMES trong script rồi chạy lại, đừng sửa tay.
// Không cài lucide-react vào mini-app: mỗi worktree quán sẽ phải npm install lại trước khi deploy.
import type { SVGProps } from "react";

type IconNode = [string, Record<string, string>][];

function createIcon(displayName: string, node: IconNode) {
  function Icon({ className, ...props }: SVGProps<SVGSVGElement>) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={className ?? "size-5"}
        {...props}
      >
        {node.map(([tag, attrs], index) => {
          const Tag = tag as "path";
          return <Tag key={index} {...attrs} />;
        })}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}
`)
for (const [Comp, file] of Object.entries(NAMES)) {
  const src = fs.readFileSync(path.join(ICON_DIR, file + '.mjs'), 'utf8')
  // Icon nhỏ lucide viết mảng trên MỘT dòng, icon lớn nhiều dòng — bắt tới "];" ngay trước "const" kế tiếp.
  const m = src.match(/const __iconNode = (\[[\s\S]*?\]);\s*\nconst /)
  if (!m) throw new Error('no node ' + file)
  // bỏ thuộc tính key của lucide
  const node = m[1].replace(/,\s*key:\s*"[^"]*"/g, '')
  out.push(`export const ${Comp}Icon = createIcon("${Comp}Icon", ${node.trim()} as IconNode);\n`)
}
fs.writeFileSync(OUT, out.join('\n'))
console.log('wrote', Object.keys(NAMES).length, 'icons')
