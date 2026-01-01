import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Upload, Search } from "lucide-react";
import * as XLSX from "xlsx";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const MAX_RECORDS = 1_000_000;

type RecordResult = {
  record_id?: number;
  contact_number: string;
  source_name?: string;
  created_at?: string;
  error?: string;
};

export function RecordsManager() {
  const { profile } = useAuth();
  const isMainUser = profile?.role === "main";

  /* ---------- SEARCH STATES ---------- */
  const [contactsInput, setContactsInput] = useState("");
  const [results, setResults] = useState<RecordResult[]>([]);

  /* ---------- COMMON STATES ---------- */
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  /* ---------- FILE STATES ---------- */
  const [file, setFile] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [contactCol, setContactCol] = useState("");
  const [sourceCol, setSourceCol] = useState("");

  const isMappingComplete =
    columns.length > 0 && contactCol !== "" && sourceCol !== "";

  /* ================= SEARCH ================= */

  const handleSearch = async () => {
    if (!contactsInput.trim()) {
      setMessage("Enter contact numbers");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setResults([]);

      const token = localStorage.getItem("token");

      const contacts = contactsInput
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);

      const res = await fetch(`${API_BASE}/records/fetch-by-contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contact_numbers: contacts }),
      });

      const data = await res.json();

      if (!res.ok || !data.results?.length) {
        setMessage("No records found");
        return;
      }

      setResults(data.results);
    } catch {
      setMessage("Search failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= FILE READ ================= */

  const handleFileSelect = (file: File) => {
    setFile(file);
    setFileLoading(true);
    setMessage("Reading file, please wait...");
    setColumns([]);
    setRows([]);
    setContactCol("");
    setSourceCol("");

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      const recordCount = json.length - 1;

      if (recordCount <= 0) {
        setMessage("File is empty");
        setFileLoading(false);
        return;
      }

      if (recordCount > MAX_RECORDS) {
        setMessage(`Maximum allowed records is ${MAX_RECORDS}`);
        setFile(null);
        setFileLoading(false);
        return;
      }

      setColumns(json[0] as string[]);
      setRows(json.slice(1));
      setMessage(`File loaded (${recordCount} records)`);
      setFileLoading(false);
    };

    reader.onerror = () => {
      setMessage("File reading failed");
      setFileLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  /* ================= FINAL UPLOAD (CHUNKED) ================= */

  const handleFinalUpload = async () => {
    if (!file) {
      setMessage("Please select a file");
      return;
    }

    if (!isMappingComplete) {
      setMessage("Column mapping is required");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setProgress("Uploading all records in one go...");

      const token = localStorage.getItem("token");

      const mapped = rows.map((row) => ({
        contact_number: String(
          row[columns.indexOf(contactCol)] ?? ""
        ).trim(),
        source_name: String(
          row[columns.indexOf(sourceCol)] ?? ""
        ).trim(),
      }));

      // 🚀 SINGLE API CALL - All records at once
      const res = await fetch(`${API_BASE}/records/upload-mapped`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ records: mapped }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setMessage(`✅ Successfully uploaded ${data.inserted} records (${data.skipped} skipped)`);
      setProgress("");
      setFile(null);
      setColumns([]);
      setRows([]);
      setContactCol("");
      setSourceCol("");
    } catch (error) {
      setMessage(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isMainUser) return null;

  return (
    <div className="bg-white rounded-xl shadow-md p-6 space-y-8">
      <h2 className="text-2xl font-bold">GFY Records Manager</h2>

      {message && (
        <div className="p-3 bg-blue-100 rounded text-blue-800">
          {message}
        </div>
      )}

      {progress && (
        <p className="text-sm text-blue-700 font-medium">{progress}</p>
      )}

      {/* SEARCH */}
      <div>
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Search className="w-4 h-4" />
          Search by Contact Number
        </h3>

        <textarea
          rows={5}
          value={contactsInput}
          onChange={(e) => setContactsInput(e.target.value)}
          placeholder="One contact per line"
          className="w-full border p-3 rounded"
        />

        <button
          onClick={handleSearch}
          disabled={loading}
          className="mt-2 bg-blue-600 text-white px-5 py-2 rounded"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* FILE UPLOAD */}
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload CSV / Excel (Max {MAX_RECORDS})
        </h3>

        <input
          type="file"
          accept=".xlsx,.csv"
          disabled={fileLoading}
          onChange={(e) =>
            e.target.files && handleFileSelect(e.target.files[0])
          }
        />

        {fileLoading && (
          <p className="mt-2 text-blue-600">Reading file...</p>
        )}

        {columns.length > 0 && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="font-medium">Contact Number Column *</label>
              <select
                className="ml-3 border p-2 rounded"
                value={contactCol}
                onChange={(e) => setContactCol(e.target.value)}
              >
                <option value="">Select</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-medium">Source Name Column *</label>
              <select
                className="ml-3 border p-2 rounded"
                value={sourceCol}
                onChange={(e) => setSourceCol(e.target.value)}
              >
                <option value="">Select</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleFinalUpload}
              disabled={loading || !isMappingComplete}
              className={`px-6 py-2 rounded text-white ${
                loading || !isMappingComplete
                  ? "bg-gray-400"
                  : "bg-green-600"
              }`}
            >
              {loading ? "Uploading..." : "Final Upload"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}



