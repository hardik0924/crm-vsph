import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Search, Edit2, Loader2, Trash2, ListChecks, RefreshCw, X,
} from "lucide-react";
import Button from "../components/ui/Button";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { api } from "../utils/api";
import { exportCsv } from "../utils/csv";
import { canDoAction, currentOrgRole } from "../utils/modules";
import AddTaskModal from "../components/modals/AddTaskModal";
import TaskDetailView from "../components/TaskDetailView";
import toast from "react-hot-toast";

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"];

const PRIORITY_COLORS = {
  HIGH: "bg-rose-50 text-rose-700 border-rose-100",
  NORMAL: "bg-vsph-grey text-vsph-navy border-slate-200",
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

const STATUS_COLORS = {
  TODO: "bg-slate-100 text-slate-600 border-slate-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-100",
  BLOCKED: "bg-amber-50 text-amber-700 border-amber-100",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

const statusLabel = (status) =>
  (status || "TODO").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const label = (value) =>
  (value || "-").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const Tasks = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assignedTo = searchParams.get("assigned_to") || "";
  const canCreate = canDoAction("TASKS", "CREATE");
  const canEdit = canDoAction("TASKS", "EDIT");
  const canManageTasks = canEdit && currentOrgRole() !== "EMPLOYEE";
  const canDelete = canManageTasks;

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [tasksData, setTasksData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);
  const [viewTaskId, setViewTaskId] = useState(null);

  useEffect(() => {
    const taskId = searchParams.get("task_id");
    if (taskId) setViewTaskId(taskId);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => fetchTasks(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, currentPage, assignedTo]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: currentPage, limit });
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter) params.set("status", statusFilter);
      if (assignedTo) params.set("assigned_to", assignedTo);
      const response = await api.get(`/api/tasks?${params.toString()}`);
      if (response.success) {
        setTasksData(response.data || []);
        setTotalRecords(response.pagination?.totalRecords || 0);
        setSummary(response.summary || null);
      } else {
        setError(response.message || "Could not load tasks.");
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
      setSelectedRows(tasksData.map((t) => t.task_id));
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
      if (next.length === tasksData.length) setSelectAll(true);
    }
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete task "${task.task_subject || "Untitled"}"?`)) return;
    const res = await api.delete(`/api/tasks/${task.task_id}`);
    if (res.success !== false) {
      toast.success("Task deleted");
      setSelectedRows([]);
      setSelectAll(false);
      fetchTasks();
    } else {
      toast.error(res.message || "Could not delete task");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedRows.length} selected task(s)?`)) return;
    const results = await Promise.all(selectedRows.map((id) => api.delete(`/api/tasks/${id}`)));
    if (results.every((res) => res.success)) {
      toast.success("Tasks deleted");
      setSelectedRows([]);
      setSelectAll(false);
      fetchTasks();
    } else {
      toast.error("Some tasks could not be deleted");
      fetchTasks();
    }
  };

  const priorityBadge = (priority) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[priority] || PRIORITY_COLORS.NORMAL}`}>
      {label(priority)}
    </span>
  );

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("");
    setCurrentPage(1);
    if (assignedTo) navigate("/v2/tasks");
  };

  const byStatus = summary?.byStatus || {};
  const hasFilters = Boolean(searchTerm || statusFilter || assignedTo);

  return (
    <div className="flex flex-col h-full bg-page-bg animate-fade-in">
      <PageHeader
        title="Tasks"
        description="Manage your to-dos and follow-ups"
        exportData={{
          filename: "tasks.csv",
          onExport: () =>
            exportCsv("tasks.csv", tasksData, [
              { label: "Subject", value: (row) => row.task_subject },
              { label: "Priority", value: (row) => row.task_priority },
              { label: "Due date", value: (row) => row.task_due_date && new Date(row.task_due_date).toLocaleDateString() },
              { label: "Assigned to", value: (row) => row.user?.user_name },
            ]),
        }}
        primaryAction={{
          label: "New task",
          icon: <Plus size={16} />,
          onClick: () => setIsAddModalOpen(true),
          disabled: !canCreate,
          title: canCreate ? "Create a task" : "You do not have create access",
        }}
      />

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Total tasks" value={summary?.total} />
          <StatCard label="In progress" value={byStatus.IN_PROGRESS} tone="text-vsph-core-blue" />
          <StatCard label="Blocked" value={byStatus.BLOCKED} tone="text-amber-600" />
          <StatCard label="Completed" value={byStatus.COMPLETED} tone="text-emerald-600" />
          <StatCard label="Overdue" value={summary?.overdue} tone="text-rose-600" />
        </div>

        <div className="card border-border">
          <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search tasks…"
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
              className="w-44 px-3 py-2 border border-border rounded-lg text-sm bg-white"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </select>

            {assignedTo && (
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Filtered by assignee
              </span>
            )}

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
              <button onClick={fetchTasks} className="inline-flex items-center gap-1 font-semibold hover:underline">
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
                          aria-label="Select all tasks"
                        />
                      )}
                    </th>
                    <th className="min-w-[220px]">Subject</th>
                    <th className="min-w-[120px]">Status</th>
                    <th className="min-w-[100px]">Priority</th>
                    <th className="min-w-[140px]">Progress</th>
                    <th className="min-w-[120px]">Due date</th>
                    <th className="min-w-[140px]">Assigned to</th>
                    <th className="min-w-[96px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="py-24 text-center text-secondary">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Loader2 className="animate-spin text-vsph-core-blue" size={28} />
                          <p className="text-sm font-medium">Loading tasks…</p>
                        </div>
                      </td>
                    </tr>
                  ) : tasksData.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-24 text-center text-secondary font-medium">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ListChecks size={44} className="text-slate-200" />
                          <p>{hasFilters ? "No tasks match these filters." : "No tasks yet."}</p>
                          {hasFilters ? (
                            <button
                              onClick={clearFilters}
                              className="mt-2 text-xs font-semibold text-vsph-core-blue hover:underline"
                            >
                              Clear filters
                            </button>
                          ) : canCreate ? (
                            <button
                              onClick={() => setIsAddModalOpen(true)}
                              className="mt-2 text-xs font-semibold text-vsph-core-blue hover:underline"
                            >
                              Add your first task
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    tasksData.map((task) => (
                      <tr
                        key={task.task_id}
                        className={`hover:bg-vsph-light-blue/20 group cursor-pointer transition-colors ${selectedRows.includes(task.task_id) ? "bg-vsph-light-blue/30" : ""}`}
                        onClick={() => setViewTaskId(task.task_id)}
                      >
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {canDelete && (
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-vsph-core-blue focus:ring-vsph-core-blue cursor-pointer"
                              checked={selectedRows.includes(task.task_id)}
                              onChange={(e) => { e.stopPropagation(); toggleRow(task.task_id); }}
                              aria-label={`Select ${task.task_subject || "task"}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-sidebar group-hover:text-vsph-core-blue truncate max-w-[260px]">
                          {task.task_subject || "Untitled"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-semibold border ${STATUS_COLORS[task.task_status] || STATUS_COLORS.TODO}`}>
                            {statusLabel(task.task_status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">{priorityBadge(task.task_priority)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-slate-200 overflow-hidden">
                              <div className="h-full rounded-full bg-vsph-core-blue" style={{ width: `${task.task_progress || 0}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{task.task_progress || 0}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {task.task_due_date ? new Date(task.task_due_date).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate">
                          {task.user?.user_name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center justify-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canManageTasks && (
                              <button
                                className="btn-icon"
                                title="Edit"
                                onClick={() => { setTaskToEdit(task); setIsAddModalOpen(true); }}
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="p-2 rounded text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                                title="Delete"
                                onClick={() => handleDelete(task)}
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
              {Math.min(currentPage * limit, totalRecords)} of {totalRecords} tasks
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

      <AddTaskModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setTaskToEdit(null); }}
        onSuccess={fetchTasks}
        taskToEdit={taskToEdit}
      />
      {viewTaskId && (
        <TaskDetailView
          isOpen={!!viewTaskId}
          onClose={() => setViewTaskId(null)}
          taskId={viewTaskId}
          onChanged={fetchTasks}
          onDeleted={fetchTasks}
        />
      )}
    </div>
  );
};

export default Tasks;
