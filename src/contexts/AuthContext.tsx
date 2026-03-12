import React, { createContext, useContext, useState, useCallback } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  username: string;
  login: (username: string, password: string) => boolean;
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

  const login = useCallback((user: string, pass: string) => {
    // Mock auth - accepts admin/admin
    if (user === "admin" && pass === "admin") {
      setIsAuthenticated(true);
      setUsername(user);
      localStorage.setItem("miniflu_auth", "true");
      localStorage.setItem("miniflu_user", user);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setUsername("");
    localStorage.removeItem("miniflu_auth");
    localStorage.removeItem("miniflu_user");
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
