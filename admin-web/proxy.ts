import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { adminPathAllowed, canEnterAdmin, canEnterStaffArea, homeForRole, parseOperatorRow, type OperatorRole } from '@/lib/auth/roles'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh session (bắt buộc — đừng xoá)
  const { data: { user } } = await supabase.auth.getUser()

  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isMevoRoute = request.nextUrl.pathname.startsWith('/mevo')
  const isStaffRoute = request.nextUrl.pathname.startsWith('/staff')
  const isLoginPage = request.nextUrl.pathname === '/login'

  // Server action (header Next-Action) và request RSC của điều hướng mềm / prefetch (header RSC) KHÔNG
  // cần cổng redirect theo role: layout /admin, /mevo, /staff tự kiểm quyền (requireOperatorOrRedirect…)
  // và RLS là lớp khoá thật. Bỏ bước tra mevo_operators cho chúng → mỗi request bớt 1 chặng tới Supabase
  // (2026-10-04: proxy tốn 300–1700ms MỖI request khi mở hộp thoại cấu hình). Vẫn getUser ở trên để
  // làm mới phiên đăng nhập.
  if (request.headers.has('next-action') || request.headers.get('rsc') === '1') return supabaseResponse

  // Role-aware routing (Onboarding Cockpit + Staff Assisted Ordering): mevo_operators.role
  // quyết định /admin, /mevo hay /staff. RLS mới là lớp khoá thật — đây chỉ là cổng UX redirect sớm.
  let role: OperatorRole | null = null
  if (user && (isAdminRoute || isMevoRoute || isStaffRoute || isLoginPage)) {
    const { data: op } = await supabase
      .from('mevo_operators')
      .select('role, store_id, is_active')
      .eq('user_id', user.id)
      .maybeSingle()
    // Nhân viên bị vô hiệu hoá (is_active=false) coi như không có role → bị đẩy về /login.
    role = parseOperatorRow(op)?.role ?? null
  }

  // Đích đúng theo role — dùng cho cả redirect khỏi khu sai lẫn khỏi /login (luật ở lib/auth/roles.ts).
  const homeFor = (r: OperatorRole | null): string | null => (r ? homeForRole(r) : null)

  // Không phải operator (đã đăng nhập nhưng không có role) → /login kèm cờ báo lỗi.
  const toLogin = () => {
    const url = new URL('/login', request.url)
    if (user && !role) url.searchParams.set('error', 'not_operator')
    return NextResponse.redirect(url)
  }

  // /admin — chủ quán + thu ngân (PA-2). Thu ngân chỉ vào POS / Báo cáo / Đặt bàn / Thực đơn (Tạm hết) /
  // Tài khoản; trang khác → về POS. Staff/superadmin → đúng khu của họ (không dead-end ở /login).
  if (isAdminRoute && (!canEnterAdmin(role) || !adminPathAllowed(role as OperatorRole, request.nextUrl.pathname))) {
    const home = homeFor(role)
    return home ? NextResponse.redirect(new URL(home, request.url)) : toLogin()
  }

  // /mevo — chỉ superadmin.
  if (isMevoRoute && role !== 'mevo_superadmin') {
    const home = homeFor(role)
    return home ? NextResponse.redirect(new URL(home, request.url)) : toLogin()
  }

  // /staff — nhân viên, chủ quán (hỗ trợ/test), thu ngân (in hoá đơn 80mm ở /staff/tables/print). Superadmin → /mevo.
  if (isStaffRoute && !canEnterStaffArea(role)) {
    const home = homeFor(role)
    return home ? NextResponse.redirect(new URL(home, request.url)) : toLogin()
  }

  // Đã đăng nhập và có role mà vào /login → về đúng khu (KHÔNG bounce non-operator, tránh vòng lặp).
  if (isLoginPage && role) {
    return NextResponse.redirect(new URL(homeFor(role)!, request.url))
  }

  return supabaseResponse
}

export const config = {
  // Chạy proxy trên mọi route, trừ static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
