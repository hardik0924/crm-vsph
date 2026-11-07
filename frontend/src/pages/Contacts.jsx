import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Search, Edit2, Loader2, Trash2, Users, RefreshCw, X,
} from "lucide-react";
import Button from "../components/ui/Button";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { api } from "../utils/api";
import { exportCsv } from "../utils/csv";
import AddContactModal from "../components/modals/AddContactModal";
import ConDetailView from "../components/ConDetailView";
import { canDoAction } from "../utils/modules";
import toast from "react-hot-toast";

const CALL_STATUSES = [
  "RINGING",
  "PITCH_DONE",
  "NOT_INTERESTED",
  "NOT_RELEVANT",
  "LEFT_ORGANIZATION",
  "NOT_AVAILABLE",
  "CONNECTED",
  "NOT_CONNECTED",
  "WRONG_NUMBER",
  "DNC",
];

const formatName = (c) =>
  [c.contact_salutation, c.contact_firstname, c.contact_lastname, c.contact_suffix]
    .filter(Boolean)
    .join(" ") || "—";

const callStatusBadge = (status) => {
  const variants = {
    CONNECTED: "bg-emerald-50 text-emerald-700 border-emerald-100",
    PITCH_DONE: "bg-vsph-core-blue/10 text-vsph-core-blue border-vsph-core-blue/20",
    FOLLOW_UP: "bg-vsph-light-blue/20 text-vsph-core-blue border-vsph-light-blue/20",
    NOT_INTERESTED: "bg-rose-50 text-rose-700 border-rose-100",
    NOT_RELEVANT: "bg-slate-50 text-slate-600 border-slate-100",
    LEFT_ORGANIZATION: "bg-rose-50 text-rose-700 border-rose-100",
    NOT_AVAILABLE: "bg-amber-50 text-amber-700 border-amber-100",
    NOT_CONNECTED: "bg-rose-50 text-rose-700 border-rose-100",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[status] || variants.NOT_RELEVANT}`}>
      {status ? status.replace(/_/g, " ") : "—"}
    </span>
  );
};

const Contacts = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [contactsData, setContactsData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState(null);
  const [viewContactId, setViewContactId] = useState(null);
  const [searchParams] = useSearchParams();
  const canCreate = canDoAction("CONTACTS", "CREATE");
  const canEdit = canDoAction("CONTACTS", "EDIT");
  const canDelete = canDoAction("CONTACTS", "DELETE");
  const navigate = useNavigate();

  useEffect(() => {
    const contactId = searchParams.get("contact_id");
    if (contactId) setViewContactId(contactId);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => fetchContacts(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, currentPage]);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: currentPage, limit });
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter) params.set("status", statusFilter);
      const response = await api.get(`/api/contacts?${params.toString()}`);
      if (response.success) {
        setContactsData(response.data || []);
        setTotalRecords(response.pagination?.totalRecords || 0);
        setSummary(response.summary || null);
      } else {
        setError(response.message || "Could not load contacts.");
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
      setSelectedRows(contactsData.map((c) => c.contact_id));
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
      if (next.length === contactsData.length) setSelectAll(true);
    }
  };

  const handleDelete = async (contact) => {
    const name = [contact.contact_firstname, contact.contact_lastname].filter(Boolean).join(" ") || "this contact";
    if (!window.confirm(`Delete ${name}?`)) return;
    const res = await api.delete(`/api/contacts/${contact.contact_id}`);
    if (res.success) {
      toast.success("Contact deleted");
      setSelectedRows([]);
      setSelectAll(false);
      fetchContacts();
    } else {
      toast.error(res.message || "Could not delete contact");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedRows.length} selected contact(s)?`)) return;
    const results = await Promise.all(selectedRows.map((id) => api.delete(`/api/contacts/${id}`)));
    if (results.every((res) => res.success)) {
      toast.success("Contacts deleted");
      setSelectedRows([]);
      setSelectAll(false);
      fetchContacts();
    } else {
      toast.error("Some contacts could not be deleted");
      fetchContacts();
    }
  };

  const byStatus = summary?.byCallStatus || {};
  const hasFilters = Boolean(searchTerm || statusFilter);

  return (
    <div className="flex flex-col h-full bg-page-bg animate-fade-in">
      <PageHeader
        title="Contacts"
        description="Manage your organization's contacts and relationships"
        exportData={{
          filename: "contacts.csv",
          onExport: () =>
            exportCsv("contacts.csv", contactsData, [
              { label: "Code", value: (row) => row.contact_code },
              { label: "First name", value: (row) => row.contact_firstname },
              { label: "Last name", value: (row) => row.contact_lastname },
              { label: "Account", value: (row) => row.account?.account_name },
              { label: "Email", value: (row) => row.contact_professional_email || row.contact_personal_email },
              { label: "Owner", value: (row) => row.contact_owner?.user_name },
            ]),
        }}
        primaryAction={
          canCreate
            ? {
                label: "New contact",
                icon: <Plus size={16} />,
                onClick: () => setIsAddModalOpen(true),
              }
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Total contacts" value={summary?.total} />
          <StatCard label="Connected" value={byStatus.CONNECTED} tone="text-emerald-600" />
          <StatCard label="Pitch done" value={byStatus.PITCH_DONE} tone="text-vsph-core-blue" />
          <StatCard label="Not interested" value={byStatus.NOT_INTERESTED} tone="text-rose-600" />
          <StatCard label="With account" value={summary?.withAccount} tone="text-amber-600" />
        </div>

        <div className="card border-border">
          <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search contacts…"
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
              className="w-48 px-3 py-2 border border-border rounded-lg text-sm bg-white"
              aria-label="Filter by call status"
            >
              <option value="">All call statuses</option>
              {CALL_STATUSES.map((status) => (
                <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
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
              <button onClick={fetchContacts} className="inline-flex items-center gap-1 font-semibold hover:underline">
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
                          aria-label="Select all contacts"
                        />
                      )}
                    </th>
                    <th className="min-w-[220px]">Contact</th>
                    <th className="min-w-[160px]">Account</th>
                    <th className="min-w-[200px]">Email</th>
                    <th className="min-w-[120px]">Owner</th>
                    <th className="min-w-[140px] text-center">Call status</th>
                    <th className="min-w-[96px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="py-24 text-center text-secondary">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Loader2 className="animate-spin text-vsph-core-blue" size={28} />
                          <p className="text-sm font-medium">Loading contacts…</p>
                        </div>
                      </td>
                    </tr>
                  ) : contactsData.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-24 text-center text-secondary font-medium">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Users size={44} className="text-slate-200" />
                          <p>{hasFilters ? "No contacts match these filters." : "No contacts yet."}</p>
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
                              Add your first contact
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    contactsData.map((contact) => (
                      <tr
                        key={contact.contact_id}
                        className={`hover:bg-vsph-light-blue/20 group cursor-pointer transition-colors ${selectedRows.includes(contact.contact_id) ? "bg-vsph-light-blue/30" : ""}`}
                        onClick={() => setViewContactId(contact.contact_id)}
                      >
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {canDelete && (
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-vsph-core-blue focus:ring-vsph-core-blue cursor-pointer"
                              checked={selectedRows.includes(contact.contact_id)}
                              onChange={(e) => { e.stopPropagation(); toggleRow(contact.contact_id); }}
                              aria-label={`Select ${formatName(contact)}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-sidebar group-hover:text-vsph-core-blue truncate max-w-[260px]">
                            {formatName(contact)}
                          </p>
                          <p className="text-[11px] text-secondary">{contact.contact_code || "No code"}</p>
                        </td>
                        <td
                          className="px-4 py-3 text-vsph-core-blue hover:underline cursor-pointer truncate"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (contact.contact_account_fk) navigate(`/v2/accounts?account_id=${contact.contact_account_fk}`);
                          }}
                        >
                          {contact.account?.account_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate">
                          {contact.contact_professional_email || contact.contact_personal_email || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate">
                          {contact.contact_owner?.user_name || "—"}
                        </td>
                        <td className="px-4 py-3 text-center">{callStatusBadge(contact.contact_call_status)}</td>
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center justify-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canEdit && (
                              <button
                                onClick={() => { setContactToEdit(contact); setIsAddModalOpen(true); }}
                                className="btn-icon"
                                title="Edit"
                              >
                                <Edit2 size={16} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(contact)}
                                className="p-2 rounded text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                                title="Delete"
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
              {Math.min(currentPage * limit, totalRecords)} of {totalRecords} contacts
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

      <AddContactModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setContactToEdit(null); }}
        onSuccess={fetchContacts}
        contactToEdit={contactToEdit}
      />
      {viewContactId && (
        <ConDetailView
          isOpen={!!viewContactId}
          onClose={() => setViewContactId(null)}
          contactId={viewContactId}
        />
      )}
    </div>
  );
};

export default Contacts;
