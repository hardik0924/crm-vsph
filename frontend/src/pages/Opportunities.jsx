import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, Edit2, Loader2, Trash2, TrendingUp, RefreshCw, X,
} from "lucide-react";
import Button from "../components/ui/Button";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { api } from "../utils/api";
import { exportCsv } from "../utils/csv";
import AddOpportunityModal from "../components/modals/AddOpportunityModal";
import OppDetailView from "../components/OppDetailView";
import { canDoAction } from "../utils/modules";
import toast from "react-hot-toast";

const STAGES = [
  { value: "PITCH_DONE", label: "Pitch done" },
  { value: "FOLLOW_UP", label: "Follow up" },
  { value: "CONTRACT_OUT", label: "Contract out" },
  { value: "CLOSED_WON", label: "Closed won" },
  { value: "CLOSED_LOST", label: "Closed lost" },
];

const STAGE_COLORS = {
  PITCH_DONE: "bg-vsph-core-blue text-white",
  FOLLOW_UP: "bg-vsph-light-blue text-vsph-navy",
  CONTRACT_OUT: "bg-amber-400 text-white",
  CLOSED_WON: "bg-emerald-500 text-white",
  CLOSED_LOST: "bg-rose-500 text-white",
  UNASSIGNED: "bg-slate-300 text-slate-600",
};

const Opportunities = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [opportunitiesData, setOpportunitiesData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [opportunityToEdit, setOpportunityToEdit] = useState(null);
  const [viewOpportunityId, setViewOpportunityId] = useState(null);
  const [searchParams] = useSearchParams();
  const canCreate = canDoAction("OPPORTUNITIES", "CREATE");
  const canEdit = canDoAction("OPPORTUNITIES", "EDIT");
  const canDelete = canDoAction("OPPORTUNITIES", "DELETE");

  useEffect(() => {
    const opportunityId = searchParams.get("opportunity_id");
    if (opportunityId) setViewOpportunityId(opportunityId);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => fetchOpportunities(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, stageFilter, currentPage]);

  const fetchOpportunities = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: currentPage, limit });
      if (searchTerm) params.set("search", searchTerm);
      if (stageFilter) params.set("stage", stageFilter);
      const response = await api.get(`/api/opportunities?${params.toString()}`);
      if (response.success) {
        setOpportunitiesData(response.data || []);
        setTotalRecords(response.pagination?.totalRecords || 0);
        setSummary(response.summary || null);
      } else {
        setError(response.message || "Could not load opportunities.");
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
      setSelectedRows(opportunitiesData.map((o) => o.opportunity_id));
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
      if (next.length === opportunitiesData.length) setSelectAll(true);
    }
  };

  const handleDelete = async (opportunity) => {
    if (!window.confirm(`Delete opportunity "${opportunity.opportunity_name}"?`)) return;
    const res = await api.delete(`/api/opportunities/${opportunity.opportunity_id}`);
    if (res.success) {
      toast.success("Opportunity deleted");
      setSelectedRows([]);
      setSelectAll(false);
      fetchOpportunities();
    } else {
      toast.error(res.message || "Could not delete opportunity");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedRows.length} selected opportunity(ies)?`)) return;
    const results = await Promise.all(selectedRows.map((id) => api.delete(`/api/opportunities/${id}`)));
    if (results.every((res) => res.success)) {
      toast.success("Opportunities deleted");
      setSelectedRows([]);
      setSelectAll(false);
      fetchOpportunities();
    } else {
      toast.error("Some opportunities could not be deleted");
      fetchOpportunities();
    }
  };

  const byStage = summary?.byStage || {};
  const open = (summary?.total || 0) - (byStage.CLOSED_WON || 0) - (byStage.CLOSED_LOST || 0);
  const hasFilters = Boolean(searchTerm || stageFilter);

  return (
    <div className="flex flex-col h-full bg-page-bg animate-fade-in">
      <PageHeader
        title="Opportunities"
        description="Track your sales pipeline and close more deals"
        exportData={{
          filename: "opportunities.csv",
          onExport: () =>
            exportCsv("opportunities.csv", opportunitiesData, [
              { label: "Name", value: (row) => row.opportunity_name },
              { label: "Stage", value: (row) => row.opportunity_stage },
              { label: "Close date", value: (row) => row.opportunity_close_date && new Date(row.opportunity_close_date).toLocaleDateString() },
              { label: "Owner", value: (row) => row.opportunity_owner?.user_name },
              { label: "Account", value: (row) => row.opportunity_account?.account_name },
            ]),
        }}
        primaryAction={
          canCreate
            ? {
                label: "New opportunity",
                icon: <Plus size={16} />,
                onClick: () => setIsAddModalOpen(true),
              }
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Total opportunities" value={summary?.total} />
          <StatCard label="Open pipeline" value={summary ? open : undefined} tone="text-vsph-core-blue" />
          <StatCard label="Contract out" value={byStage.CONTRACT_OUT} tone="text-amber-600" />
          <StatCard label="Closed won" value={byStage.CLOSED_WON} tone="text-emerald-600" />
          <StatCard label="Closed lost" value={byStage.CLOSED_LOST} tone="text-rose-600" />
        </div>

        <div className="card border-border">
          <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search opportunities…"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-vsph-core-blue focus:border-vsph-core-blue"
              />
            </div>

            <select
              value={stageFilter}
              onChange={(event) => {
                setStageFilter(event.target.value);
                setCurrentPage(1);
              }}
              className="w-44 px-3 py-2 border border-border rounded-lg text-sm bg-white"
              aria-label="Filter by stage"
            >
              <option value="">All stages</option>
              {STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>{stage.label}</option>
              ))}
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setStageFilter("");
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
              <button onClick={fetchOpportunities} className="inline-flex items-center gap-1 font-semibold hover:underline">
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
                          aria-label="Select all opportunities"
                        />
                      )}
                    </th>
                    <th className="min-w-[220px]">Opportunity</th>
                    <th className="min-w-[140px]">Stage</th>
                    <th className="min-w-[120px]">Close date</th>
                    <th className="min-w-[120px]">Owner</th>
                    <th className="min-w-[160px]">Account</th>
                    <th className="min-w-[96px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="py-24 text-center text-secondary">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Loader2 className="animate-spin text-vsph-core-blue" size={28} />
                          <p className="text-sm font-medium">Loading opportunities…</p>
                        </div>
                      </td>
                    </tr>
                  ) : opportunitiesData.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-24 text-center text-secondary font-medium">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <TrendingUp size={44} className="text-slate-200" />
                          <p>{hasFilters ? "No opportunities match these filters." : "No opportunities yet."}</p>
                          {hasFilters ? (
                            <button
                              onClick={() => {
                                setSearchTerm("");
                                setStageFilter("");
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
                              Add your first opportunity
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    opportunitiesData.map((opp) => (
                      <tr
                        key={opp.opportunity_id}
                        className={`hover:bg-vsph-light-blue/20 group cursor-pointer transition-colors ${selectedRows.includes(opp.opportunity_id) ? "bg-vsph-light-blue/30" : ""}`}
                        onClick={() => setViewOpportunityId(opp.opportunity_id)}
                      >
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {canDelete && (
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-vsph-core-blue focus:ring-vsph-core-blue cursor-pointer"
                              checked={selectedRows.includes(opp.opportunity_id)}
                              onChange={(e) => { e.stopPropagation(); toggleRow(opp.opportunity_id); }}
                              aria-label={`Select ${opp.opportunity_name}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-sidebar group-hover:text-vsph-core-blue truncate max-w-[260px]">
                          {opp.opportunity_name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-semibold ${STAGE_COLORS[opp.opportunity_stage] || STAGE_COLORS.UNASSIGNED}`}>
                            {opp.opportunity_stage?.replace(/_/g, " ") || "Unassigned"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {opp.opportunity_close_date ? new Date(opp.opportunity_close_date).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate">
                          {opp.opportunity_owner?.user_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate">
                          {opp.opportunity_account?.account_name || "—"}
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
                                onClick={() => { setOpportunityToEdit(opp); setIsAddModalOpen(true); }}
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="p-2 rounded text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                                title="Delete"
                                onClick={() => handleDelete(opp)}
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
              {Math.min(currentPage * limit, totalRecords)} of {totalRecords} opportunities
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

      <AddOpportunityModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setOpportunityToEdit(null); }}
        onSuccess={fetchOpportunities}
        opportunityToEdit={opportunityToEdit}
      />
      {viewOpportunityId && (
        <OppDetailView
          isOpen={!!viewOpportunityId}
          onClose={() => setViewOpportunityId(null)}
          opportunityId={viewOpportunityId}
          onEdit={(opp) => { setViewOpportunityId(null); setOpportunityToEdit(opp); setIsAddModalOpen(true); }}
          onDeleted={fetchOpportunities}
        />
      )}
    </div>
  );
};

export default Opportunities;
