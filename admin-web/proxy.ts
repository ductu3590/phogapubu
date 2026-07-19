import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  // Role-aware routing (Onboarding Cockpit + Staff Assisted Ordering): mevo_operators.role
  // quyết định /admin, /mevo hay /staff. RLS mới là lớp khoá thật — đây chỉ là cổng UX redirect sớm.
  let role: 'mevo_superadmin' | 'store_owner' | 'store_staff' | null = null
  if (user && (isAdminRoute || isMevoRoute || isStaffRoute || isLoginPage)) {
    const { data: op } = await supabase
      .from('mevo_operators')
      .select('role, store_id, is_active')
      .eq('user_id', user.id)
      .maybeSingle()
    // Nhân viên bị vô hiệu hoá (is_active=false) coi như không có role → bị đẩy về /login.
    if (op?.is_active === false) role = null
    else if (op?.role === 'mevo_superadmin' && op.store_id === null) role = 'mevo_superadmin'
    else if (op?.role === 'store_owner' && op.store_id) role = 'store_owner'
    else if (op?.role === 'store_staff' && op.store_id) role = 'store_staff'
  }

  // Đích đúng theo role — dùng cho cả redirect khỏi khu sai lẫn khỏi /login.
  const homeFor = (r: typeof role): string | null =>
    r === 'mevo_superadmin' ? '/mevo' : r === 'store_owner' ? '/admin' : r === 'store_staff' ? '/staff/order' : null

  // Không phải operator (đã đăng nhập nhưng không có role) → /login kèm cờ báo lỗi.
  const toLogin = () => {
    const url = new URL('/login', request.url)
    if (user && !role) url.searchParams.set('error', 'not_operator')
    return NextResponse.redirect(url)
  }

  // /admin — chỉ store_owner. Staff/superadmin đã đăng nhập → đẩy về đúng khu (không dead-end ở /login).
  if (isAdminRoute && role !== 'store_owner') {
    const home = homeFor(role)
    return home ? NextResponse.redirect(new URL(home, request.url)) : toLogin()
  }

  // /mevo — chỉ superadmin.
  if (isMevoRoute && role !== 'mevo_superadmin') {
    const home = homeFor(role)
    return home ? NextResponse.redirect(new URL(home, request.url)) : toLogin()
  }

  // /staff — store_staff và store_owner (owner vào để hỗ trợ/test). Superadmin → /mevo.
  if (isStaffRoute && role !== 'store_staff' && role !== 'store_owner') {
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
