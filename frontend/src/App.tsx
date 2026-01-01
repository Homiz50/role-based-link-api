import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Login } from "./components/Login";
import { MainApp } from "./components/MainApp";

function AppContent() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return profile ? <MainApp /> : <Login />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
