import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import React, { useState } from "react";
import { useSnackbar } from "zmp-ui";
import { copy } from "@/constants/copy";

const MAX_RETRIES = 3;

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { openSnackbar } = useSnackbar();
  // Một client cho cả vòng đời app. Lỗi nghiệp vụ do từng màn tự hiện; ở đây chỉ nhắc khi mất mạng.
  const [client] = useState(() => {
    const warnIfOffline = () => {
      if (!navigator.onLine) {
        openSnackbar({ text: copy.common.networkError, type: "warning" });
      }
    };
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          gcTime: 5 * 60 * 1000,
          refetchOnWindowFocus: false,
          retry: MAX_RETRIES,
        },
      },
      queryCache: new QueryCache({
        onError: (_error, query) => {
          if (query.state.fetchFailureCount >= MAX_RETRIES) warnIfOffline();
        },
      }),
      mutationCache: new MutationCache({ onError: warnIfOffline }),
    });
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
