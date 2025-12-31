import { createContext, useContext, useEffect, useState } from "react";

type Profile = {
  role: "main" | "sub";
  email?: string;
};

interface AuthContextType {
  profile: Profile | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ AUTO LOGIN FROM LOCAL STORAGE (ON REFRESH)
  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (token && role) {
      setProfile({
        role: role as "main" | "sub",
      });
    } else {
      setProfile(null);
    }

    setLoading(false);
  }, []);

  // ✅ JWT LOGOUT
  const signOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    setProfile(null);
    window.location.href = "/";
  };

  const value = {
    profile,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ✅ SAFE HOOK
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
