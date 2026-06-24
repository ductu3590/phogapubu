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
  const isLoginPage = request.nextUrl.pathname === '/login'

  // Operator allowlist (Plan 2 — 2a): chỉ user trong mevo_operators mới được vào admin.
  // Chỉ tra khi cần (đang vào /admin hoặc đã đăng nhập mà ở /login).
  // Lưu ý: RLS (006b) mới là lớp khoá thật — đây là cổng UX để redirect sớm.
  let isOperator = false
  if (user && (isAdminRoute || isLoginPage)) {
    const { data: op } = await supabase
      .from('mevo_operators')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    isOperator = !!op
  }

  // Vào /admin mà chưa đăng nhập HOẶC không phải operator → về /login
  if (isAdminRoute && (!user || !isOperator)) {
    const url = new URL('/login', request.url)
    if (user && !isOperator) url.searchParams.set('error', 'not_operator')
    return NextResponse.redirect(url)
  }

  // Đã đăng nhập VÀ là operator mà vào /login → sang /admin
  // (KHÔNG bounce non-operator để tránh vòng lặp redirect)
  if (isLoginPage && user && isOperator) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return supabaseResponse
}

export const config = {
  // Chạy proxy trên mọi route, trừ static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
