import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Edit2, Loader2, Trash2, Megaphone, RefreshCw, X } from "lucide-react";
import Button from "../components/ui/Button";
import PageHeader from "../components/ui/PageHeader";
import { api } from "../utils/api";
import { exportCsv } from "../utils/csv";
import AddCampaignModal from "../components/modals/AddCampaignModal";
import { canDoAction } from "../utils/modules";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_STYLES,
  CAMPAIGN_TYPES,
  dateOnly,
  money,
  statusLabel,
  typeLabel,
} from "../utils/campaigns";
import toast from "react-hot-toast";

const EMPTY_FILTERS = { search: "", status: "", type: "", owner: "", from: "", to: "" };

const StatCard = ({ label, value, tone }) => (
  <div className="card border-border p-4">
    <p className="text-[10px] font-semibold text-secondary uppercase tracking-wider">{label}</p>
    <p className={`text-2xl font-bold leading-none mt-1 ${tone || "text-sidebar"}`}>{value}</p>
  </div>
);

const Campaigns = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [campaignsData, setCampaignsData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [campaignToEdit, setCampaignToEdit] = useState(null);

  const canCreate = canDoAction("CAMPAIGNS", "CREATE");
  const canEdit = canDoAction("CAMPAIGNS", "EDIT");
  const canDelete = canDoAction("CAMPAIGNS", "DELETE");

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setFilters((current) => ({ ...current, search: searchTerm }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!canEdit) return;
    api
      .get("/api/users?limit=100")
      .then((res) => {
        if (res.success) setUsers(res.data || []);
      })
      .catch(() => setUsers([]));
  }, [canEdit]);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: currentPage, limit });
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      const response = await api.get(`/api/campaigns?${params.toString()}`);
      if (response.success) {
        setCampaignsData(response.data || []);
        setTotalRecords(response.pagination?.totalRecords || 0);
        setSummary(response.summary || null);
      } else {
        setError(response.message || "Could not load campaigns.");
      }
    } catch {
      setError("Could not reach the CRM API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage]);

  const setFilter = (key, value) => {
    setCurrentPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilters(EMPTY_FILTERS);
    setCurrentPage(1);
  };

  const hasFilters = Object.values(filters).some(Boolean);

  const handleDelete = async (campaign) => {
    if (!window.confirm(`Delete campaign "${campaign.campaign_name || "Untitled"}"? Linked contacts, opportunities and tasks are kept.`)) {
      return;
    }
    const res = await api.delete(`/api/campaigns/${campaign.campaign_id}`);
    if (res.success) {
      toast.success("Campaign deleted");
      setSelectedRows([]);
      fetchCampaigns();
    } else {
      toast.error(res.message || "Could not delete campaign");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedRows.length} selected campaign(s)? Linked records are kept.`)) return;
    const results = await Promise.all(selectedRows.map((id) => api.delete(`/api/campaigns/${id}`)));
    if (results.every((res) => res.success)) {
      toast.success("Campaigns deleted");
    } else {
      toast.error("Some campaigns could not be deleted");
    }
    setSelectedRows([]);
    fetchCampaigns();
  };

  const allSelected = campaignsData.length > 0 && selectedRows.length === campaignsData.length;

  const toggleRow = (id) =>
    setSelectedRows((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id]
    );

  const byStatus = summary?.byStatus || {};

  return (
    <div className="flex flex-col h-full bg-page-bg animate-fade-in">
      <PageHeader
        title="Campaigns"
        description="Plan audiences, budgets and performance for every campaign"
        exportData={{
          filename: "campaigns.csv",
          onExport: () =>
            exportCsv("campaigns.csv", campaignsData, [
              { label: "Name", value: (row) => row.campaign_name },
              { label: "Code", value: (row) => row.campaign_code },
              { label: "Type", value: (row) => typeLabel(row.campaign_type) },
              { label: "Owner", value: (row) => row.user?.user_name },
              { label: "Status", value: (row) => statusLabel(row.campaign_status) },
              { label: "Start date", value: (row) => dateOnly(row.campaign_start_date) },
              { label: "End date", value: (row) => dateOnly(row.campaign_end_date) },
              { label: "Planned budget", value: (row) => money(row.campaign_planned_budget) },
              { label: "Actual cost", value: (row) => money(row.campaign_actual_cost) },
              { label: "Contacts", value: (row) => row._count?.contacts || 0 },
              { label: "Opportunities", value: (row) => row._count?.opportunities || 0 },
              { label: "Updated", value: (row) => dateOnly(row.campaign_updated_at) },
            ]),
        }}
        primaryAction={
          canCreate
            ? {
                label: "New campaign",
                icon: <Plus size={16} />,
                onClick: () => setIsAddModalOpen(true),
              }
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Total campaigns" value={summary?.total ?? "—"} />
          <StatCard label="Active" value={byStatus.ACTIVE ?? "—"} tone="text-emerald-600" />
          <StatCard label="Planned" value={byStatus.PLANNED ?? "—"} tone="text-vsph-core-blue" />
          <StatCard label="Completed" value={byStatus.COMPLETED ?? "—"} tone="text-vsph-navy" />
          <StatCard
            label="Planned budget"
            value={summary ? money(summary.plannedBudget) : "—"}
          />
          <StatCard label="Actual cost" value={summary ? money(summary.actualCost) : "—"} />
        </div>

        <div className="card border-border">
          <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name or code…"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-vsph-core-blue focus:border-vsph-core-blue"
              />
            </div>

            <select
              value={filters.status}
              onChange={(event) => setFilter("status", event.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-white"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {CAMPAIGN_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>

            <select
              value={filters.type}
              onChange={(event) => setFilter("type", event.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-white"
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              {CAMPAIGN_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>

            {canEdit && users.length > 0 && (
              <select
                value={filters.owner}
                onChange={(event) => setFilter("owner", event.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm bg-white"
                aria-label="Filter by owner"
              >
                <option value="">All owners</option>
                {users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>{user.user_name}</option>
                ))}
              </select>
            )}

            <label className="flex items-center gap-2 text-xs text-secondary">
              Start from
              <input
                type="date"
                value={filters.from}
                onChange={(event) => setFilter("from", event.target.value)}
                className="px-2 py-2 border border-border rounded-lg text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-secondary">
              to
              <input
                type="date"
                value={filters.to}
                onChange={(event) => setFilter("to", event.target.value)}
                className="px-2 py-2 border border-border rounded-lg text-sm"
              />
            </label>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
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
              <button onClick={fetchCampaigns} className="inline-flex items-center gap-1 font-semibold hover:underline">
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
                          checked={allSelected}
                          onChange={() => setSelectedRows(allSelected ? [] : campaignsData.map((c) => c.campaign_id))}
                          aria-label="Select all campaigns"
                        />
                      )}
                    </th>
                    <th className="min-w-[220px]">Campaign</th>
                    <th className="min-w-[120px]">Type</th>
                    <th className="min-w-[130px]">Owner</th>
                    <th className="min-w-[110px]">Status</th>
                    <th className="min-w-[110px]">Start</th>
                    <th className="min-w-[110px]">End</th>
                    <th className="min-w-[120px] text-right">Planned budget</th>
                    <th className="min-w-[90px] text-right">Contacts</th>
                    <th className="min-w-[110px] text-right">Opportunities</th>
                    <th className="min-w-[110px]">Updated</th>
                    <th className="min-w-[96px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {loading ? (
                    <tr>
                      <td colSpan="12" className="py-24 text-center text-secondary">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Loader2 className="animate-spin text-vsph-core-blue" size={28} />
                          <p className="text-sm font-medium">Loading campaigns…</p>
                        </div>
                      </td>
                    </tr>
                  ) : campaignsData.length === 0 ? (
                    <tr>
                      <td colSpan="12" className="py-24 text-center text-secondary font-medium">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Megaphone size={44} className="text-slate-200" />
                          <p>{hasFilters ? "No campaigns match these filters." : "No campaigns yet."}</p>
                          {hasFilters ? (
                            <button onClick={clearFilters} className="mt-2 text-xs font-semibold text-vsph-core-blue hover:underline">
                              Clear filters
                            </button>
                          ) : canCreate ? (
                            <button
                              onClick={() => setIsAddModalOpen(true)}
                              className="mt-2 text-xs font-semibold text-vsph-core-blue hover:underline"
                            >
                              Create your first campaign
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    campaignsData.map((campaign) => (
                      <tr
                        key={campaign.campaign_id}
                        className={`hover:bg-vsph-light-blue/20 group cursor-pointer transition-colors ${
                          selectedRows.includes(campaign.campaign_id) ? "bg-vsph-light-blue/30" : ""
                        }`}
                        onClick={() => navigate(`/v2/campaigns/${campaign.campaign_id}`)}
                      >
                        <td className="px-4 py-3 text-center">
                          {canDelete && (
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-vsph-core-blue focus:ring-vsph-core-blue cursor-pointer"
                              checked={selectedRows.includes(campaign.campaign_id)}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleRow(campaign.campaign_id);
                              }}
                              aria-label={`Select ${campaign.campaign_name || "campaign"}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-sidebar group-hover:text-vsph-core-blue truncate max-w-[260px]">
                            {campaign.campaign_name || "Untitled campaign"}
                          </p>
                          <p className="text-[11px] text-secondary">{campaign.campaign_code || "No code"}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{typeLabel(campaign.campaign_type)}</td>
                        <td className="px-4 py-3 text-slate-600 truncate">{campaign.user?.user_name || "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-1 rounded border text-[10px] font-semibold ${
                              CAMPAIGN_STATUS_STYLES[campaign.campaign_status] || CAMPAIGN_STATUS_STYLES.DRAFT
                            }`}
                          >
                            {statusLabel(campaign.campaign_status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dateOnly(campaign.campaign_start_date)}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dateOnly(campaign.campaign_end_date)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 font-medium">{money(campaign.campaign_planned_budget)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{campaign._count?.contacts || 0}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{campaign._count?.opportunities || 0}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateOnly(campaign.campaign_updated_at)}</td>
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center justify-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {canEdit && (
                              <button
                                className="btn-icon"
                                title="Edit"
                                onClick={() => {
                                  setCampaignToEdit(campaign);
                                  setIsAddModalOpen(true);
                                }}
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="p-2 rounded text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                                title="Delete"
                                onClick={() => handleDelete(campaign)}
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
              {Math.min(currentPage * limit, totalRecords)} of {totalRecords} campaigns
            </span>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
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

      <AddCampaignModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setCampaignToEdit(null);
        }}
        onSuccess={fetchCampaigns}
        campaignToEdit={campaignToEdit}
      />
    </div>
  );
};

export default Campaigns;
