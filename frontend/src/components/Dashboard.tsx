import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Search } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

type LinkResult = {
  link: string | null;
  generatedId: string;
  status?: string;
  error?: string;
};

type CopyFilter = "all" | "unique" | "duplicate_ids" | "duplicate_links";

export function Dashboard() {
  const { profile } = useAuth();
  const isMainUser = profile?.role === "main";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<LinkResult | null>(null);

  const [bulkContent, setBulkContent] = useState("");
  const [bulkResults, setBulkResults] = useState<LinkResult[]>([]);

  const [copyFilter, setCopyFilter] = useState<CopyFilter>("all");
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  /* ================= SEARCH ================= */

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setMessage("Enter a PRB ID or Link");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setSearchResult(null);

      const token = localStorage.getItem("token");
      const isPRB = searchQuery.startsWith("PRB");

      const url = isPRB
        ? `${API_BASE}/fetch/by-ids-bulk`
        : `${API_BASE}/fetch/by-links-bulk`;

      const payload = isPRB
        ? { prb_ids: [searchQuery] }
        : { links: [searchQuery] };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.results?.length) {
        setMessage("No result found");
        return;
      }

      const result = data.results[0];

      setSearchResult({
        generatedId: result.generatedId,
        link: result.link ?? null,
        status: result.status,
      });
    } catch {
      setMessage("Backend error");
    } finally {
      setLoading(false);
    }
  };

  /* ================= DELETE (MAIN ONLY) ================= */

  const handleDelete = async () => {
    if (!searchResult?.generatedId) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${searchResult.generatedId}?`
    );
    if (!confirmDelete) return;

    try {
      setLoading(true);
      setMessage("");

      const token = localStorage.getItem("token");

      const res = await fetch(
        `${API_BASE}/links/delete/${searchResult.generatedId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok || data.error) {
        setMessage(data.error || "Delete failed");
        return;
      }

      setMessage(data.message || "Link deleted successfully");
      setSearchResult(null);
    } catch {
      setMessage("Backend error while deleting");
    } finally {
      setLoading(false);
    }
  };

  /* ================= BULK SUBMIT ================= */

  const handleSubmit = async () => {
    if (!bulkContent.trim()) {
      setMessage("Please enter bulk data");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setBulkResults([]);

      const token = localStorage.getItem("token");

      const lines = bulkContent
        .split("\n")
        .map((i) => i.trim())
        .filter(Boolean);

      const isPRBBulk = lines[0].startsWith("PRB");

      const url = isPRBBulk
        ? `${API_BASE}/fetch/by-ids-bulk`
        : `${API_BASE}/fetch/by-links-bulk`;

      const payload = isPRBBulk
        ? { prb_ids: lines }
        : { links: lines };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage("Bulk request failed");
        return;
      }

      setBulkResults(data.results);
      setMessage(`Processed ${data.count} records`);
      setBulkContent("");
    } catch {
      setMessage("Backend error");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setBulkContent("");
    setBulkResults([]);
    setSearchResult(null);
    setMessage("");
  };

  /* ================= AGGREGATION ================= */

  const aggregated = {
    allIds: bulkResults.map((i) => i.generatedId),
    uniqueIds: bulkResults.filter((i) => i.status === "created").map((i) => i.generatedId),
    duplicateIds: bulkResults.filter((i) => i.status === "existing").map((i) => i.generatedId),
    duplicateLinks: bulkResults
      .filter((i) => i.status === "existing" && i.link)
      .map((i) => i.link as string),
  };

  /* ================= COPY ================= */

  const handleCopy = async () => {
    let data: string[] = [];
    let emptyMsg = "";

    switch (copyFilter) {
      case "all":
        data = aggregated.allIds;
        emptyMsg = "No IDs exist to copy";
        break;
      case "unique":
        data = aggregated.uniqueIds;
        emptyMsg = "No unique IDs exist";
        break;
      case "duplicate_ids":
        data = aggregated.duplicateIds;
        emptyMsg = "No duplicate IDs exist";
        break;
      case "duplicate_links":
        data = aggregated.duplicateLinks;
        emptyMsg = "No duplicate links exist";
        break;
    }

    if (data.length === 0) {
      setMessage(emptyMsg);
      return;
    }

    await navigator.clipboard.writeText(data.join("\n"));
    setMessage("Copied successfully");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ================= UI ================= */

  return (
    <div className="space-y-6">
      {/* SEARCH */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex items-center gap-3 mb-4">
          <Search className="text-blue-600" />
          <h2 className="text-xl font-bold">Search Link</h2>
        </div>

        <div className="flex gap-3">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 border px-4 py-2 rounded-lg"
            placeholder="Enter PRB ID or URL"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {/* SEARCH RESULT + DELETE */}
        {searchResult && (
          <div className="mt-4 p-4 bg-blue-50 border rounded-lg space-y-2">
            <p><b>Generated ID:</b> {searchResult.generatedId}</p>
            <p>
              <b>Link:</b>{" "}
              {searchResult.link ? (
                <a
                  href={searchResult.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline"
                >
                  {searchResult.link}
                </a>
              ) : (
                "Not Found"
              )}
            </p>

            {isMainUser && (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="bg-red-600 text-white px-4 py-2 rounded-lg"
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* BULK */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        {message && (
          <div className="mb-4 p-3 bg-green-100 rounded">{message}</div>
        )}

        <textarea
          rows={7}
          value={bulkContent}
          onChange={(e) => setBulkContent(e.target.value)}
          className="w-full border p-3 rounded-lg"
          placeholder="Paste bulk PRB IDs or links"
        />

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg"
          >
            Submit
          </button>
          <button
            onClick={handleClear}
            className="border px-6 py-2 rounded-lg"
          >
            Clear
          </button>
        </div>

        {bulkResults.length > 0 && (
          <div className="flex justify-end gap-3 mt-4">
            <select
              value={copyFilter}
              onChange={(e) => setCopyFilter(e.target.value as CopyFilter)}
              className="border px-3 py-2 rounded-lg"
            >
              <option value="all">All IDs</option>
              <option value="unique">Unique IDs</option>
              <option value="duplicate_ids">Duplicate IDs</option>
              <option value="duplicate_links">Duplicate Links</option>
            </select>

            <button
              onClick={handleCopy}
              className={`px-6 py-2 rounded-lg text-white ${
                copied ? "bg-green-600" : "bg-blue-600"
              }`}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        )}

        {bulkResults.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border rounded-lg text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left">Link</th>
                  <th className="border px-3 py-2 text-left">Generated ID</th>
                  <th className="border px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {bulkResults.map((item, index) => {
                  const uiStatus =
                    item.status === "created"
                      ? "unique"
                      : item.status === "existing"
                      ? "duplicate"
                      : item.status || "fetched";

                  const statusClass =
                    uiStatus === "unique"
                      ? "bg-green-100 text-green-700"
                      : uiStatus === "duplicate"
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700";

                  return (
                    <tr key={index} className="border-t">
                      <td className="border px-3 py-2 break-all">
                        {item.link || "Not Found"}
                      </td>
                      <td className="border px-3 py-2 font-mono">
                        {item.generatedId}
                      </td>
                      <td className="border px-3 py-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass}`}>
                          {uiStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
