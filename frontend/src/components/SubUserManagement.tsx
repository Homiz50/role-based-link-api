import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { UserPlus, Users } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

type SubUser = {
  email: string;
};

export function SubUserManagement() {
  const { profile } = useAuth();

  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isMainUser = profile?.role === "main";

  // ✅ CREATE SUB USER (FASTAPI)
  const handleCreateSubUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(`${API_BASE}/auth/create-subuser`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: "Sub User",
          email,
          password,
        }),
      });

      const data = await response.json();

      // ✅ ✅ ✅ MOST IMPORTANT FIX
      if (data.error) {
        setMessage(data.error);     // Show duplicate email or backend error
        return;
      }

      if (!response.ok) {
        setMessage("Sub-user creation failed");
        return;
      }

      // ✅ Add locally ONLY if backend confirms success
      setSubUsers((prev) => [{ email }, ...prev]);

      setEmail("");
      setPassword("");
      setShowForm(false);
      setMessage("Sub-user created successfully ✅");

    } catch (err) {
      setMessage("Server error");
    } finally {
      setLoading(false);
    }
  };

  // ✅ BLOCK SUB USERS FROM ACCESSING THIS
  if (!isMainUser) {
    return (
      <div className="p-6 bg-white rounded-lg text-center text-red-600 font-semibold">
        Only Main Users can manage sub-users.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Sub-Users</h2>
        </div>

        <button
          onClick={() => {
            setShowForm(!showForm);
            setMessage("");
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          <UserPlus className="w-4 h-4" />
          Add Sub-User
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-slate-50 rounded-lg border">
          <h3 className="font-semibold mb-4">Create New Sub-User</h3>

          {message && (
            <div
              className={`mb-4 p-3 rounded text-sm ${
                message.includes("success")
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {message}
            </div>
          )}

          <form onSubmit={handleCreateSubUser} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border p-2 rounded"
              placeholder="subuser@example.com"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border p-2 rounded"
              placeholder="••••••••"
            />

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                {loading ? "Creating..." : "Create"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setMessage("");
                }}
                className="border px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {subUsers.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No sub-users created in this session.
          </p>
        ) : (
          subUsers.map((subUser, i) => (
            <div key={i} className="p-4 border rounded-lg bg-slate-50">
              <p className="font-medium text-gray-900">{subUser.email}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


