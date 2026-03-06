"use client";

import { useEffect, useState } from "react";

const ACCESS_KEY = "access";

export function useSession() {
  const [token, setToken] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(ACCESS_KEY) || "";
    setToken(t);
    setReady(true);
  }, []);

  function setAccessToken(nextToken: string) {
    if (nextToken) {
      localStorage.setItem(ACCESS_KEY, nextToken);
      setToken(nextToken);
      return;
    }
    localStorage.removeItem(ACCESS_KEY);
    setToken("");
  }

  function logout() {
    localStorage.removeItem(ACCESS_KEY);
    setToken("");
  }

  return {
    token,
    isAuthenticated: !!token,
    ready,
    setAccessToken,
    logout,
  };
}