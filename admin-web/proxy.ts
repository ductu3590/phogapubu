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
  const isLoginPage = request.nextUrl.pathname === '/login'

  // Role-aware routing (Onboarding Cockpit): mevo_operators.role quyết định /admin hay /mevo.
  // RLS (019) mới là lớp khoá thật — đây vẫn chỉ là cổng UX để redirect sớm.
  let role: 'mevo_superadmin' | 'store_owner' | null = null
  if (user && (isAdminRoute || isMevoRoute || isLoginPage)) {
    const { data: op } = await supabase
      .from('mevo_operators')
      .select('role, store_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (op?.role === 'mevo_superadmin' && op.store_id === null) role = 'mevo_superadmin'
    else if (op?.role === 'store_owner' && op.store_id) role = 'store_owner'
  }

  // Vào /admin mà chưa đăng nhập, không phải operator, HOẶC là superadmin (không có store riêng) → /login
  if (isAdminRoute && (!user || role !== 'store_owner')) {
    const url = new URL('/login', request.url)
    if (user && !role) url.searchParams.set('error', 'not_operator')
    return NextResponse.redirect(url)
  }

  // Vào /mevo mà không phải superadmin → /login
  if (isMevoRoute && (!user || role !== 'mevo_superadmin')) {
    const url = new URL('/login', request.url)
    if (user && !role) url.searchParams.set('error', 'not_operator')
    return NextResponse.redirect(url)
  }

  // Đã đăng nhập và có role mà vào /login → về đúng khu (KHÔNG bounce non-operator, tránh vòng lặp)
  if (isLoginPage && user && role === 'mevo_superadmin') {
    return NextResponse.redirect(new URL('/mevo', request.url))
  }
  if (isLoginPage && user && role === 'store_owner') {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return supabaseResponse
}

export const config = {
  // Chạy proxy trên mọi route, trừ static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
