import React, { createContext, useContext, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface AuthContextType {
  isAuthenticated: boolean;
  username: string;
  role: string;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem("miniflu_auth") === "true");
  const [username, setUsername] = useState(() => localStorage.getItem("miniflu_user") || "");
  const [role, setRole] = useState(() => localStorage.getItem("miniflu_role") || "admin");

  const isAdmin = role === "admin";

  const login = useCallback(async (user: string, pass: string) => {
    try {
      const result = await api.login(user, pass);
      if (result.ok) {
        setIsAuthenticated(true);
        setUsername(user);
        setRole(result.role || "admin");
        localStorage.setItem("miniflu_auth", "true");
        localStorage.setItem("miniflu_user", user);
        localStorage.setItem("miniflu_role", result.role || "admin");
        return true;
      }
    } catch {}
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setUsername("");
    setRole("admin");
    localStorage.removeItem("miniflu_auth");
    localStorage.removeItem("miniflu_user");
    localStorage.removeItem("miniflu_role");
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, role, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
