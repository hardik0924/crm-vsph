import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, Edit2, Loader2, Trash2, Briefcase, Plus, RefreshCw, X,
} from "lucide-react";
import Button from "../components/ui/Button";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { api } from "../utils/api";
import { exportCsv } from "../utils/csv";
import AddAccountModal from "../components/modals/AddAccountModal";
import AccountDetailView from "../components/AccDetailView";
import { canDoAction } from "../utils/modules";
import toast from "react-hot-toast";

const ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE"];

const statusBadge = (status) => {
  const variants = {
    ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-100",
    INACTIVE: "bg-rose-50 text-rose-700 border-rose-100",
    SUSPENDED: "bg-amber-50 text-amber-700 border-amber-100",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[status] || variants.ACTIVE}`}>
      {status ? status.replace(/_/g, " ") : "—"}
    </span>
  );
};

const Accounts = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [accountsData, setAccountsData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState(null);
  const [viewAccountId, setViewAccountId] = useState(null);
  const [searchParams] = useSearchParams();
  const canCreate = canDoAction("ACCOUNTS", "CREATE");
  const canEdit = canDoAction("ACCOUNTS", "EDIT");
  const canDelete = canDoAction("ACCOUNTS", "DELETE");

  useEffect(() => {
    const accountId = searchParams.get("account_id");
    if (accountId) setViewAccountId(accountId);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => fetchAccounts(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, currentPage]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: currentPage, limit });
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter) params.set("status", statusFilter);
      const response = await api.get(`/api/accounts?${params.toString()}`);
      if (response.success) {
        setAccountsData(response.data || []);
        setTotalRecords(response.pagination?.totalRecords || 0);
        setSummary(response.summary || null);
      } else {
        setError(response.message || "Could not load accounts.");
      }
    } catch {
      setError("Could not reach the CRM API.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedRows([]);
      setSelectAll(false);
    } else {
      setSelectedRows(accountsData.map((a) => a.account_id));
      setSelectAll(true);
    }
  };

  const toggleRow = (id) => {
    if (selectedRows.includes(id)) {
      setSelectedRows(selectedRows.filter((r) => r !== id));
      setSelectAll(false);
    } else {
      const next = [...selectedRows, id];
      setSelectedRows(next);
      if (next.length === accountsData.length) setSelectAll(true);
    }
  };

  const handleDelete = async (account) => {
    if (!window.confirm(`Delete account "${account.account_name}"?`)) return;
    const res = await api.delete("/api/accounts", { ids: [account.account_id] });
    if (res.success) {
      toast.success("Account deleted");
      setSelectedRows([]);
      setSelectAll(false);
      fetchAccounts();
    } else {
      toast.error(res.message || "Could not delete account");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedRows.length} selected account(s)?`)) return;
    const res = await api.delete("/api/accounts", { ids: selectedRows });
    if (res.success) {
      toast.success("Accounts deleted");
      setSelectedRows([]);
      setSelectAll(false);
      fetchAccounts();
    } else {
      toast.error(res.message || "Could not delete accounts");
    }
  };

  const byStatus = summary?.byStatus || {};
  const hasFilters = Boolean(searchTerm || statusFilter);

  return (
    <div className="flex flex-col h-full bg-page-bg animate-fade-in">
      <PageHeader
        title="Accounts"
        description="Manage your organization's accounts and clients"
        exportData={{
          filename: "accounts.csv",
          onExport: () =>
            exportCsv("accounts.csv", accountsData, [
              { label: "Code", value: (row) => row.account_code },
              { label: "Name", value: (row) => row.account_name },
              { label: "Employees", value: (row) => row.account_employees_size },
              { label: "Industry", value: (row) => row.account_industry || row.industry?.industry_name },
              { label: "City", value: (row) => row.account_city },
              { label: "Status", value: (row) => row.account_account_status },
            ]),
        }}
        primaryAction={
          canCreate
            ? {
                label: "New account",
                icon: <Plus size={16} />,
                onClick: () => setIsAddModalOpen(true),
              }
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Total accounts" value={summary?.total} />
          <StatCard label="Active" value={byStatus.ACTIVE} tone="text-emerald-600" />
          <StatCard label="Inactive" value={byStatus.INACTIVE} tone="text-rose-600" />
          <StatCard label="With contacts" value={summary?.withContacts} tone="text-vsph-core-blue" />
          <StatCard label="Industries" value={summary?.industries} tone="text-vsph-navy" />
        </div>

        <div className="card border-border">
          <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, industry or city…"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-vsph-core-blue focus:border-vsph-core-blue"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setCurrentPage(1);
              }}
              className="w-40 px-3 py-2 border border-border rounded-lg text-sm bg-white"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {ACCOUNT_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("");
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-vsph-core-blue hover:underline"
              >
                <X size={14} /> Clear filters
              </button>
            )}

            {canDelete && selectedRows.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBulkDelete}
                className="gap-2 font-semibold text-danger border border-rose-100 hover:bg-rose-50 ml-auto"
              >
                <Trash2 size={16} /> Delete selected ({selectedRows.length})
              </Button>
            )}
          </div>

          {error && (
            <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 text-sm text-rose-700 flex items-center justify-between">
              {error}
              <button onClick={fetchAccounts} className="inline-flex items-center gap-1 font-semibold hover:underline">
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          )}

          <div className="overflow-auto">
            <div className="table-container">
              <table className="table-modern">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="w-10 min-w-[44px] text-center">
                      {canDelete && (
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-vsph-core-blue focus:ring-vsph-core-blue cursor-pointer"
                          checked={selectAll}
                          onChange={toggleSelectAll}
                          aria-label="Select all accounts"
                        />
                      )}
                    </th>
                    <th className="min-w-[220px]">Account</th>
                    <th className="min-w-[140px]">Industry</th>
                    <th className="min-w-[140px]">Location</th>
                    <th className="min-w-[100px] text-center">Status</th>
                    <th className="min-w-[96px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="py-24 text-center text-secondary">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Loader2 className="animate-spin text-vsph-core-blue" size={28} />
                          <p className="text-sm font-medium">Loading accounts…</p>
                        </div>
                      </td>
                    </tr>
                  ) : accountsData.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-24 text-center text-secondary font-medium">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Briefcase size={44} className="text-slate-200" />
                          <p>{hasFilters ? "No accounts match these filters." : "No accounts yet."}</p>
                          {hasFilters ? (
                            <button
                              onClick={() => {
                                setSearchTerm("");
                                setStatusFilter("");
                                setCurrentPage(1);
                              }}
                              className="mt-2 text-xs font-semibold text-vsph-core-blue hover:underline"
                            >
                              Clear filters
                            </button>
                          ) : canCreate ? (
                            <button
                              onClick={() => setIsAddModalOpen(true)}
                              className="mt-2 text-xs font-semibold text-vsph-core-blue hover:underline"
                            >
                              Add your first account
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    accountsData.map((acc) => (
                      <tr
                        key={acc.account_id}
                        className={`hover:bg-vsph-light-blue/20 group cursor-pointer transition-colors ${selectedRows.includes(acc.account_id) ? "bg-vsph-light-blue/30" : ""}`}
                        onClick={() => setViewAccountId(acc.account_id)}
                      >
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {canDelete && (
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-vsph-core-blue focus:ring-vsph-core-blue cursor-pointer"
                              checked={selectedRows.includes(acc.account_id)}
                              onChange={(e) => { e.stopPropagation(); toggleRow(acc.account_id); }}
                              aria-label={`Select ${acc.account_name}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-sidebar group-hover:text-vsph-core-blue truncate max-w-[260px]">
                            {acc.account_name}
                          </p>
                          <p className="text-[11px] text-secondary">{acc.account_code || "No code"}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate">
                          {acc.account_industry || acc.industry?.industry_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate">{acc.account_city || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {statusBadge(acc.account_account_status)}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center justify-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canEdit && (
                              <button
                                className="btn-icon"
                                title="Edit"
                                onClick={() => { setAccountToEdit(acc); setIsAddModalOpen(true); }}
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="p-2 rounded text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                                title="Delete"
                                onClick={() => handleDelete(acc)}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border surface flex items-center justify-between">
            <span className="text-xs text-secondary font-medium">
              Showing {totalRecords === 0 ? 0 : (currentPage - 1) * limit + 1} to{" "}
              {Math.min(currentPage * limit, totalRecords)} of {totalRecords} accounts
            </span>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage * limit >= totalRecords}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AddAccountModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setAccountToEdit(null); }}
        onSuccess={fetchAccounts}
        accountToEdit={accountToEdit}
      />
      {viewAccountId && (
        <AccountDetailView
          isOpen={!!viewAccountId}
          onClose={() => setViewAccountId(null)}
          accountId={viewAccountId}
          onEdit={(acc) => { setViewAccountId(null); setAccountToEdit(acc); setIsAddModalOpen(true); }}
          onDeleted={fetchAccounts}
        />
      )}
    </div>
  );
};

export default Accounts;
