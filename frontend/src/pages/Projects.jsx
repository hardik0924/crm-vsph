import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Edit2, Loader2, Trash2, Layers, RefreshCw, X } from "lucide-react";
import Button from "../components/ui/Button";
import PageHeader from "../components/ui/PageHeader";
import { api } from "../utils/api";
import { exportCsv } from "../utils/csv";
import AddProjectModal from "../components/modals/AddProjectModal";
import { canDoAction } from "../utils/modules";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_STYLES,
  PROJECT_TYPES,
  dateOnly,
  projectStatusLabel,
  projectTypeLabel,
} from "../utils/projects";
import toast from "react-hot-toast";

const EMPTY_FILTERS = { search: "", status: "", type: "", from: "", to: "" };

const StatCard = ({ label, value, tone }) => (
  <div className="card border-border p-4">
    <p className="text-[10px] font-semibold text-secondary uppercase tracking-wider">{label}</p>
    <p className={`text-2xl font-bold leading-none mt-1 ${tone || "text-sidebar"}`}>{value}</p>
  </div>
);

const Projects = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectsData, setProjectsData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState(null);

  const canCreate = canDoAction("PROJECTS", "CREATE");
  const canEdit = canDoAction("PROJECTS", "EDIT");
  const canDelete = canDoAction("PROJECTS", "DELETE");

  // Deep links from the global search still arrive as ?project_id=.
  useEffect(() => {
    const projectId = searchParams.get("project_id");
    if (projectId) navigate(`/v2/projects/${projectId}`, { replace: true });
  }, [searchParams, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setFilters((current) => ({ ...current, search: searchTerm }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: currentPage, limit });
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      const response = await api.get(`/api/projects?${params.toString()}`);
      if (response.success) {
        setProjectsData(response.data || []);
        setTotalRecords(response.pagination?.totalRecords || 0);
        setSummary(response.summary || null);
      } else {
        setError(response.message || "Could not load projects.");
      }
    } catch {
      setError("Could not reach the CRM API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
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

  const handleDelete = async (project) => {
    const label = project.project_name || project.project_location || "Untitled project";
    if (!window.confirm(`Delete project "${label}"? Linked contacts and opportunities are kept.`)) return;
    const res = await api.post("/api/projects/delete", { ids: [project.project_id] });
    if (res.success) {
      toast.success("Project deleted");
      setSelectedRows([]);
      fetchProjects();
    } else {
      toast.error(res.message || "Could not delete project");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedRows.length} selected project(s)? Linked records are kept.`)) return;
    const res = await api.post("/api/projects/delete", { ids: selectedRows });
    if (res.success) {
      toast.success("Projects deleted");
    } else {
      toast.error(res.message || "Could not delete projects");
    }
    setSelectedRows([]);
    fetchProjects();
  };

  const allSelected = projectsData.length > 0 && selectedRows.length === projectsData.length;

  const toggleRow = (id) =>
    setSelectedRows((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id]
    );

  const byStatus = summary?.byStatus || {};

  return (
    <div className="flex flex-col h-full bg-page-bg animate-fade-in">
      <PageHeader
        title="Projects"
        description="Manage your delivery projects and the contacts and opportunities around them"
        exportData={{
          filename: "projects.csv",
          onExport: () =>
            exportCsv("projects.csv", projectsData, [
              { label: "Name", value: (row) => row.project_name },
              { label: "Type", value: (row) => projectTypeLabel(row.project_type) },
              { label: "Location", value: (row) => row.project_location },
              { label: "Date", value: (row) => dateOnly(row.project_date) },
              { label: "Status", value: (row) => projectStatusLabel(row.project_is_active) },
              { label: "Contacts", value: (row) => row._count?.contacts || 0 },
              { label: "Opportunities", value: (row) => row._count?.opportunities || 0 },
              { label: "Updated", value: (row) => dateOnly(row.project_updated_at) },
            ]),
        }}
        primaryAction={
          canCreate
            ? {
                label: "New project",
                icon: <Plus size={16} />,
                onClick: () => setIsAddModalOpen(true),
              }
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Total projects" value={summary?.total ?? "—"} />
          <StatCard label="Active" value={byStatus.ACTIVE ?? "—"} tone="text-emerald-600" />
          <StatCard label="Inactive" value={byStatus.INACTIVE ?? "—"} tone="text-rose-600" />
          <StatCard label="Contacts linked" value={summary?.contactsLinked ?? "—"} tone="text-vsph-core-blue" />
          <StatCard label="Opportunities linked" value={summary?.opportunitiesLinked ?? "—"} tone="text-vsph-navy" />
        </div>

        <div className="card border-border">
          <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name or location…"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-vsph-core-blue focus:border-vsph-core-blue"
              />
            </div>

            <select
              value={filters.status}
              onChange={(event) => setFilter("status", event.target.value)}
              className="w-40 px-3 py-2 border border-border rounded-lg text-sm bg-white"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>

            <select
              value={filters.type}
              onChange={(event) => setFilter("type", event.target.value)}
              className="w-44 px-3 py-2 border border-border rounded-lg text-sm bg-white"
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-xs text-secondary">
              Date from
              <input
                type="date"
                value={filters.from}
                onChange={(event) => setFilter("from", event.target.value)}
                className="w-40 px-2 py-2 border border-border rounded-lg text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-secondary">
              to
              <input
                type="date"
                value={filters.to}
                onChange={(event) => setFilter("to", event.target.value)}
                className="w-40 px-2 py-2 border border-border rounded-lg text-sm"
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
              <button onClick={fetchProjects} className="inline-flex items-center gap-1 font-semibold hover:underline">
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
                          onChange={() => setSelectedRows(allSelected ? [] : projectsData.map((p) => p.project_id))}
                          aria-label="Select all projects"
                        />
                      )}
                    </th>
                    <th className="min-w-[220px]">Project</th>
                    <th className="min-w-[100px]">Type</th>
                    <th className="min-w-[160px]">Location</th>
                    <th className="min-w-[110px]">Date</th>
                    <th className="min-w-[100px]">Status</th>
                    <th className="min-w-[90px] text-right">Contacts</th>
                    <th className="min-w-[110px] text-right">Opportunities</th>
                    <th className="min-w-[110px]">Updated</th>
                    <th className="min-w-[96px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {loading ? (
                    <tr>
                      <td colSpan="10" className="py-24 text-center text-secondary">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Loader2 className="animate-spin text-vsph-core-blue" size={28} />
                          <p className="text-sm font-medium">Loading projects…</p>
                        </div>
                      </td>
                    </tr>
                  ) : projectsData.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="py-24 text-center text-secondary font-medium">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Layers size={44} className="text-slate-200" />
                          <p>{hasFilters ? "No projects match these filters." : "No projects yet."}</p>
                          {hasFilters ? (
                            <button onClick={clearFilters} className="mt-2 text-xs font-semibold text-vsph-core-blue hover:underline">
                              Clear filters
                            </button>
                          ) : canCreate ? (
                            <button
                              onClick={() => setIsAddModalOpen(true)}
                              className="mt-2 text-xs font-semibold text-vsph-core-blue hover:underline"
                            >
                              Create your first project
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    projectsData.map((project) => (
                      <tr
                        key={project.project_id}
                        className={`hover:bg-vsph-light-blue/20 group cursor-pointer transition-colors ${
                          selectedRows.includes(project.project_id) ? "bg-vsph-light-blue/30" : ""
                        }`}
                        onClick={() => navigate(`/v2/projects/${project.project_id}`)}
                      >
                        <td className="px-4 py-3 text-center">
                          {canDelete && (
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-vsph-core-blue focus:ring-vsph-core-blue cursor-pointer"
                              checked={selectedRows.includes(project.project_id)}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleRow(project.project_id);
                              }}
                              aria-label={`Select ${project.project_name || "project"}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-sidebar group-hover:text-vsph-core-blue truncate max-w-[260px]">
                            {project.project_name || "Untitled project"}
                          </p>
                          <p className="text-[11px] text-secondary">{project.project_location || "No location"}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{projectTypeLabel(project.project_type)}</td>
                        <td className="px-4 py-3 text-slate-600 truncate">{project.project_location || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{dateOnly(project.project_date)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-1 rounded border text-[10px] font-semibold ${
                              PROJECT_STATUS_STYLES[project.project_is_active] || PROJECT_STATUS_STYLES.INACTIVE
                            }`}
                          >
                            {projectStatusLabel(project.project_is_active)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{project._count?.contacts || 0}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{project._count?.opportunities || 0}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dateOnly(project.project_updated_at)}</td>
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
                                  setProjectToEdit(project);
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
                                onClick={() => handleDelete(project)}
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
              {Math.min(currentPage * limit, totalRecords)} of {totalRecords} projects
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

      <AddProjectModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setProjectToEdit(null);
        }}
        onSuccess={fetchProjects}
        projectToEdit={projectToEdit}
      />
    </div>
  );
};

export default Projects;
