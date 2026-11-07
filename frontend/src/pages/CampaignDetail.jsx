import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit2,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import Button from "../components/ui/Button";
import Breadcrumbs from "../components/ui/Breadcrumbs";
import AddCampaignModal from "../components/modals/AddCampaignModal";
import { api } from "../utils/api";
import { canDoAction } from "../utils/modules";
import {
  CAMPAIGN_STATUS_STYLES,
  dateOnly,
  money,
  priorityLabel,
  statusLabel,
  typeLabel,
} from "../utils/campaigns";
import toast from "react-hot-toast";

const OPP_STAGE_STYLES = {
  PITCH_DONE: "bg-vsph-core-blue text-white",
  FOLLOW_UP: "bg-vsph-light-blue text-vsph-navy",
  CONTRACT_OUT: "bg-amber-400 text-white",
  CLOSED_WON: "bg-emerald-500 text-white",
  CLOSED_LOST: "bg-rose-500 text-white",
  UNASSIGNED: "bg-slate-300 text-slate-600",
};

const TASK_STATUS_STYLES = {
  TODO: "bg-slate-100 text-slate-600 border-slate-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-100",
  BLOCKED: "bg-amber-50 text-amber-700 border-amber-100",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

const card = "bg-white border border-border rounded-lg";
const fieldLabel = "text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1";
const inputClass =
  "w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsph-core-blue";

const contactName = (contact) =>
  `${contact.contact_firstname || ""} ${contact.contact_lastname || ""}`.trim() || "Unnamed contact";

const Info = ({ label, value, className = "" }) => (
  <div className={`flex flex-col ${className}`}>
    <span className={fieldLabel}>{label}</span>
    <span className="text-[13px] font-semibold text-slate-700">{value || "—"}</span>
  </div>
);

const Metric = ({ label, value, hint, tone }) => (
  <div className={`${card} p-4`}>
    <p className="text-[10px] font-semibold text-secondary uppercase tracking-wider">{label}</p>
    <p className={`text-2xl font-bold leading-none mt-1 ${tone || "text-sidebar"}`}>{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-1.5">{hint}</p>}
  </div>
);

const CampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const canEdit = canDoAction("CAMPAIGNS", "EDIT");
  const canDelete = canDoAction("CAMPAIGNS", "DELETE");
  const canCreateTask = canDoAction("TASKS", "CREATE");

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);

  const [audienceSearch, setAudienceSearch] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactMatches, setContactMatches] = useState([]);
  const [searchingContacts, setSearchingContacts] = useState(false);

  const [oppQuery, setOppQuery] = useState("");
  const [oppMatches, setOppMatches] = useState([]);
  const [searchingOpps, setSearchingOpps] = useState(false);

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    task_subject: "",
    task_user_fk: "",
    task_due_date: "",
    task_priority: "NORMAL",
  });
  const [savingTask, setSavingTask] = useState(false);

  const fetchCampaign = async () => {
    setLoading((current) => current || !campaign);
    try {
      const response = await api.get(`/api/campaigns/${id}`);
      if (response.success) {
        setCampaign(response.data);
        setError("");
      } else {
        setCampaign(null);
        setError(response.message || "Campaign not found.");
      }
    } catch {
      setError("Could not reach the CRM API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCampaign(null);
    setError("");
    setLoading(true);
    fetchCampaign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!canEdit) return;
    api
      .get("/api/users?limit=100")
      .then((res) => {
        if (res.success) setUsers(res.data || []);
      })
      .catch(() => setUsers([]));
  }, [canEdit]);

  useEffect(() => {
    if (tab !== "audience") return;
    const query = contactQuery.trim();
    if (query.length < 2) {
      setContactMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingContacts(true);
      try {
        const res = await api.get(`/api/contacts?limit=10&search=${encodeURIComponent(query)}`);
        if (res.success) setContactMatches(res.data || []);
      } catch {
        setContactMatches([]);
      } finally {
        setSearchingContacts(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [tab, contactQuery]);

  useEffect(() => {
    if (tab !== "opportunities") return;
    const query = oppQuery.trim();
    if (query.length < 2) {
      setOppMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingOpps(true);
      try {
        const res = await api.get(`/api/opportunities?limit=10&search=${encodeURIComponent(query)}`);
        if (res.success) setOppMatches(res.data || []);
      } catch {
        setOppMatches([]);
      } finally {
        setSearchingOpps(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [tab, oppQuery]);

  const linkedContactIds = useMemo(
    () => new Set((campaign?.contacts || []).map((contact) => contact.contact_id)),
    [campaign]
  );
  const linkedOpportunityIds = useMemo(
    () => new Set((campaign?.opportunities || []).map((opportunity) => opportunity.opportunity_id)),
    [campaign]
  );

  const audience = useMemo(() => {
    const query = audienceSearch.trim().toLowerCase();
    if (!query) return campaign?.contacts || [];
    return (campaign?.contacts || []).filter((contact) =>
      [contactName(contact), contact.contact_professional_email, contact.account?.account_name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [campaign, audienceSearch]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-page-bg">
        <Loader2 className="animate-spin text-vsph-core-blue" size={28} />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-page-bg">
        <p className="text-sm font-semibold text-slate-600">{error || "Campaign not found."}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={fetchCampaign}>
            <RefreshCw size={14} className="mr-1.5" /> Retry
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate("/v2/campaigns")}>
            Back to campaigns
          </Button>
        </div>
      </div>
    );
  }

  const performance = campaign.performance || {};
  const linkedContactCount = campaign.contacts?.length || 0;

  const handleDelete = async () => {
    if (!window.confirm(`Delete campaign "${campaign.campaign_name || "Untitled"}"? Linked contacts, opportunities and tasks are kept.`)) {
      return;
    }
    const response = await api.delete(`/api/campaigns/${campaign.campaign_id}`);
    if (response.success) {
      toast.success("Campaign deleted");
      navigate("/v2/campaigns");
    } else {
      toast.error(response.message || "Could not delete campaign");
    }
  };

  const removeContact = async (contact) => {
    if (!window.confirm(`Remove ${contactName(contact)} from this campaign? The contact record is kept.`)) return;
    setBusy(true);
    const response = await api.delete(`/api/campaigns/${campaign.campaign_id}/contacts/${contact.contact_id}`);
    setBusy(false);
    if (response.success) {
      toast.success("Contact removed from campaign");
      fetchCampaign();
    } else {
      toast.error(response.message || "Could not remove contact");
    }
  };

  const addContact = async (contact) => {
    setBusy(true);
    const response = await api.post(`/api/campaigns/${campaign.campaign_id}/contacts`, {
      contact_ids: [contact.contact_id],
    });
    setBusy(false);
    if (response.success) {
      toast.success(
        response.data?.skipped
          ? "Contact is already in another campaign"
          : "Contact added to campaign"
      );
      setContactQuery("");
      setContactMatches([]);
      fetchCampaign();
    } else {
      toast.error(response.message || "Could not add contact");
    }
  };

  const removeOpportunity = async (opportunity) => {
    if (!window.confirm(`Remove "${opportunity.opportunity_name}" from this campaign? The opportunity record is kept.`)) {
      return;
    }
    setBusy(true);
    const response = await api.delete(
      `/api/campaigns/${campaign.campaign_id}/opportunities/${opportunity.opportunity_id}`
    );
    setBusy(false);
    if (response.success) {
      toast.success("Opportunity removed from campaign");
      fetchCampaign();
    } else {
      toast.error(response.message || "Could not remove opportunity");
    }
  };

  const addOpportunity = async (opportunity) => {
    setBusy(true);
    const response = await api.post(`/api/campaigns/${campaign.campaign_id}/opportunities`, {
      opportunity_ids: [opportunity.opportunity_id],
    });
    setBusy(false);
    if (response.success) {
      toast.success(
        response.data?.skipped
          ? "Opportunity is already attributed to another campaign"
          : "Opportunity linked to campaign"
      );
      setOppQuery("");
      setOppMatches([]);
      fetchCampaign();
    } else {
      toast.error(response.message || "Could not link opportunity");
    }
  };

  const createTask = async (event) => {
    event.preventDefault();
    if (savingTask) return;
    if (!taskForm.task_subject.trim()) {
      toast.error("Task subject is required.");
      return;
    }
    setSavingTask(true);
    const response = await api.post("/api/tasks", {
      ...taskForm,
      task_user_fk: taskForm.task_user_fk || undefined,
      task_due_date: taskForm.task_due_date || undefined,
      task_campaign_fk: campaign.campaign_id,
    });
    setSavingTask(false);
    if (response.success) {
      toast.success("Task created");
      setTaskOpen(false);
      setTaskForm({ task_subject: "", task_user_fk: "", task_due_date: "", task_priority: "NORMAL" });
      fetchCampaign();
    } else {
      toast.error(response.message || "Could not create task");
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "audience", label: `Audience (${linkedContactCount})` },
    { id: "opportunities", label: `Opportunities (${campaign.opportunities?.length || 0})` },
    { id: "tasks", label: `Tasks (${campaign.tasks?.length || 0})` },
    { id: "performance", label: "Performance" },
  ];

  return (
    <div className="flex flex-col h-full bg-page-bg animate-fade-in">
      <div className="surface border-b border-border px-8 py-5 shrink-0">
        <Breadcrumbs
          items={[
            { label: "Campaigns", path: "/v2/campaigns" },
            { label: campaign.campaign_name || "Campaign", current: true },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4 mt-2">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-sidebar text-2xl font-bold tracking-tight">
                {campaign.campaign_name || "Untitled campaign"}
              </h1>
              <span className={`inline-flex px-2 py-1 rounded border text-[10px] font-semibold ${CAMPAIGN_STATUS_STYLES[campaign.campaign_status] || CAMPAIGN_STATUS_STYLES.DRAFT}`}>
                {statusLabel(campaign.campaign_status)}
              </span>
            </div>
            <p className="text-secondary text-sm font-medium mt-1">
              {campaign.campaign_code ? `${campaign.campaign_code} · ` : ""}
              {typeLabel(campaign.campaign_type)} · {priorityLabel(campaign.campaign_priority)} priority
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate("/v2/campaigns")}>
              <ArrowLeft size={15} className="mr-1.5" /> Back
            </Button>
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <Edit2 size={15} className="mr-1.5" /> Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-rose-600 border border-rose-100 hover:bg-rose-50"
              >
                <Trash2 size={15} className="mr-1.5" /> Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-5">
        <div className={`${card} overflow-x-auto`}>
          <div className="flex border-b border-border px-2 min-w-max">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  tab === item.id
                    ? "border-vsph-core-blue text-vsph-core-blue"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Info label="Owner" value={campaign.user?.user_name} />
                <Info label="Created by" value={campaign.created_by?.user_name} />
                <Info label="Priority" value={priorityLabel(campaign.campaign_priority)} />
                <Info label="Start date" value={dateOnly(campaign.campaign_start_date)} />
                <Info label="End date" value={dateOnly(campaign.campaign_end_date)} />
                <Info label="Actual launch" value={dateOnly(campaign.campaign_launch_date)} />
                <Info label="Planned budget" value={money(campaign.campaign_planned_budget)} />
                <Info label="Actual cost" value={money(campaign.campaign_actual_cost)} />
                <Info label="Expected revenue" value={money(campaign.campaign_expected_revenue)} />
                <Info label="Created" value={dateOnly(campaign.campaign_created_at)} />
                <Info label="Updated" value={dateOnly(campaign.campaign_updated_at)} />
                <Info label="Accounts reached" value={campaign.accountsReached?.length || 0} />
              </div>

              <div>
                <p className={fieldLabel}>Objective</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {campaign.campaign_objective || "No objective recorded."}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Description</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {campaign.campaign_description || "No description recorded."}
                </p>
              </div>
            </div>
          )}

          {tab === "audience" && (
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-80">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={audienceSearch}
                    onChange={(event) => setAudienceSearch(event.target.value)}
                    placeholder="Filter linked contacts…"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <span className="text-xs text-slate-500">{linkedContactCount} linked</span>
              </div>

              {canEdit && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Plus size={14} /> Add contacts to this campaign
                  </p>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={contactQuery}
                      onChange={(event) => setContactQuery(event.target.value)}
                      placeholder="Search contacts by name, code or email…"
                      className={`${inputClass} pl-9 bg-white`}
                    />
                    {searchingContacts && (
                      <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
                    )}
                  </div>
                  {contactQuery.trim().length >= 2 && (
                    <div className="bg-white border border-slate-200 rounded-md max-h-44 overflow-y-auto divide-y divide-slate-100">
                      {contactMatches.filter((contact) => !linkedContactIds.has(contact.contact_id)).length === 0 ? (
                        <p className="p-3 text-xs text-slate-500">
                          {searchingContacts ? "Searching…" : "No matching contacts."}
                        </p>
                      ) : (
                        contactMatches
                          .filter((contact) => !linkedContactIds.has(contact.contact_id))
                          .map((contact) => (
                            <button
                              type="button"
                              key={contact.contact_id}
                              disabled={busy}
                              onClick={() => addContact(contact)}
                              className="w-full text-left px-3 py-2 hover:bg-vsph-light-blue/30 flex items-center justify-between gap-3 disabled:opacity-50"
                            >
                              <span>
                                <span className="block text-sm font-medium text-slate-800">{contactName(contact)}</span>
                                <span className="block text-[11px] text-slate-500">
                                  {contact.contact_professional_email || contact.contact_code || "No email"}
                                </span>
                              </span>
                              <Plus size={15} className="text-vsph-core-blue shrink-0" />
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {audience.length === 0 ? (
                <div className="py-14 text-center text-sm text-slate-500">
                  <Users size={36} className="mx-auto text-slate-200 mb-2" />
                  {linkedContactCount === 0
                    ? "No contacts are linked to this campaign yet."
                    : "No linked contacts match this filter."}
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Contact</th>
                        <th>Email</th>
                        <th>Account</th>
                        <th>Call status</th>
                        <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                      {audience.map((contact) => (
                        <tr key={contact.contact_id}>
                          <td className="px-4 py-3 font-semibold text-sidebar">{contactName(contact)}</td>
                          <td className="px-4 py-3 text-slate-600">{contact.contact_professional_email || "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{contact.account?.account_name || "—"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {contact.contact_call_status?.replace(/_/g, " ") || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                className="btn-icon"
                                title="Open contact"
                                onClick={() => navigate(`/v2/contacts?contact_id=${contact.contact_id}`)}
                              >
                                <ExternalLink size={15} />
                              </button>
                              {canEdit && (
                                <button
                                  className="p-2 rounded text-rose-600 hover:bg-rose-50"
                                  title="Remove from campaign"
                                  disabled={busy}
                                  onClick={() => removeContact(contact)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "opportunities" && (
            <div className="p-6 space-y-4">
              {canEdit && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Plus size={14} /> Attribute an opportunity to this campaign
                  </p>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={oppQuery}
                      onChange={(event) => setOppQuery(event.target.value)}
                      placeholder="Search opportunities by name…"
                      className={`${inputClass} pl-9 bg-white`}
                    />
                    {searchingOpps && (
                      <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
                    )}
                  </div>
                  {oppQuery.trim().length >= 2 && (
                    <div className="bg-white border border-slate-200 rounded-md max-h-44 overflow-y-auto divide-y divide-slate-100">
                      {oppMatches.filter((opportunity) => !linkedOpportunityIds.has(opportunity.opportunity_id)).length === 0 ? (
                        <p className="p-3 text-xs text-slate-500">
                          {searchingOpps ? "Searching…" : "No matching opportunities."}
                        </p>
                      ) : (
                        oppMatches
                          .filter((opportunity) => !linkedOpportunityIds.has(opportunity.opportunity_id))
                          .map((opportunity) => (
                            <button
                              type="button"
                              key={opportunity.opportunity_id}
                              disabled={busy}
                              onClick={() => addOpportunity(opportunity)}
                              className="w-full text-left px-3 py-2 hover:bg-vsph-light-blue/30 flex items-center justify-between gap-3 disabled:opacity-50"
                            >
                              <span>
                                <span className="block text-sm font-medium text-slate-800">{opportunity.opportunity_name}</span>
                                <span className="block text-[11px] text-slate-500">
                                  {opportunity.opportunity_stage?.replace(/_/g, " ") || "No stage"}
                                </span>
                              </span>
                              <Plus size={15} className="text-vsph-core-blue shrink-0" />
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {campaign.opportunities?.length === 0 ? (
                <div className="py-14 text-center text-sm text-slate-500">
                  No opportunities are attributed to this campaign yet.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Opportunity</th>
                        <th>Stage</th>
                        <th>Close date</th>
                        <th>Owner</th>
                        <th className="text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                      {campaign.opportunities.map((opportunity) => (
                        <tr key={opportunity.opportunity_id}>
                          <td className="px-4 py-3 font-semibold text-sidebar">{opportunity.opportunity_name}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-[10px] font-semibold ${OPP_STAGE_STYLES[opportunity.opportunity_stage] || "bg-slate-300 text-slate-600"}`}>
                              {opportunity.opportunity_stage?.replace(/_/g, " ") || "Unassigned"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{dateOnly(opportunity.opportunity_close_date)}</td>
                          <td className="px-4 py-3 text-slate-600">{opportunity.opportunity_owner?.user_name || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                className="btn-icon"
                                title="Open opportunity"
                                onClick={() => navigate(`/v2/opportunities?opportunity_id=${opportunity.opportunity_id}`)}
                              >
                                <ExternalLink size={15} />
                              </button>
                              {canEdit && (
                                <button
                                  className="p-2 rounded text-rose-600 hover:bg-rose-50"
                                  title="Remove attribution"
                                  disabled={busy}
                                  onClick={() => removeOpportunity(opportunity)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "tasks" && (
            <div className="p-6 space-y-4">
              {canCreateTask && (
                <div>
                  <Button variant="secondary" size="sm" onClick={() => setTaskOpen((open) => !open)}>
                    <Plus size={15} className="mr-1.5" /> {taskOpen ? "Close task form" : "New campaign task"}
                  </Button>
                  {taskOpen && (
                    <form onSubmit={createTask} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                      <label className="flex flex-col gap-1.5 md:col-span-2">
                        <span className="text-xs font-semibold text-slate-700">Subject *</span>
                        <input
                          type="text"
                          required
                          value={taskForm.task_subject}
                          onChange={(event) => setTaskForm({ ...taskForm, task_subject: event.target.value })}
                          className={`${inputClass} bg-white`}
                          placeholder="e.g. Follow up with invited leads"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-slate-700">Assignee</span>
                        <select
                          value={taskForm.task_user_fk}
                          onChange={(event) => setTaskForm({ ...taskForm, task_user_fk: event.target.value })}
                          className={`${inputClass} bg-white`}
                        >
                          <option value="">Me</option>
                          {users.map((user) => (
                            <option key={user.user_id} value={user.user_id}>{user.user_name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-slate-700">Due date</span>
                        <input
                          type="date"
                          value={taskForm.task_due_date}
                          onChange={(event) => setTaskForm({ ...taskForm, task_due_date: event.target.value })}
                          className={`${inputClass} bg-white`}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-slate-700">Priority</span>
                        <select
                          value={taskForm.task_priority}
                          onChange={(event) => setTaskForm({ ...taskForm, task_priority: event.target.value })}
                          className={`${inputClass} bg-white`}
                        >
                          <option value="LOW">Low</option>
                          <option value="NORMAL">Medium</option>
                          <option value="HIGH">High</option>
                        </select>
                      </label>
                      <div className="flex items-end md:col-span-3">
                        <Button type="submit" variant="primary" size="sm" disabled={savingTask}>
                          {savingTask && <Loader2 size={14} className="animate-spin mr-1.5" />}
                          Create task
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {campaign.tasks?.length === 0 ? (
                <div className="py-14 text-center text-sm text-slate-500">
                  No tasks are linked to this campaign yet. Tasks created here are normal CRM tasks.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Assignee</th>
                        <th>Due</th>
                        <th className="text-center">Open</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                      {campaign.tasks.map((task) => (
                        <tr key={task.task_id}>
                          <td className="px-4 py-3 font-semibold text-sidebar">{task.task_subject}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded border text-[10px] font-semibold ${TASK_STATUS_STYLES[task.task_status] || TASK_STATUS_STYLES.TODO}`}>
                              {task.task_status?.replace(/_/g, " ") || "TODO"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{priorityLabel(task.task_priority)}</td>
                          <td className="px-4 py-3 text-slate-600">{task.user?.user_name || "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{dateOnly(task.task_due_date)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              className="btn-icon"
                              title="Open task"
                              onClick={() => navigate(`/v2/tasks?task_id=${task.task_id}`)}
                            >
                              <ExternalLink size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "performance" && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric label="Contacts targeted" value={performance.contactsTargeted ?? 0} />
                <Metric
                  label="Opportunities linked"
                  value={performance.opportunitiesLinked ?? 0}
                  hint={`${performance.opportunitiesWon ?? 0} closed won`}
                />
                <Metric
                  label="Conversion rate"
                  value={performance.conversionRate === null || performance.conversionRate === undefined ? "—" : `${performance.conversionRate}%`}
                  hint="Closed won ÷ linked opportunities"
                />
                <Metric
                  label="Budget used"
                  value={
                    Number(campaign.campaign_planned_budget) > 0 && campaign.campaign_actual_cost !== null
                      ? `${Math.round((Number(campaign.campaign_actual_cost || 0) / Number(campaign.campaign_planned_budget)) * 100)}%`
                      : "—"
                  }
                  hint={`${money(campaign.campaign_actual_cost)} of ${money(campaign.campaign_planned_budget)}`}
                />
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th className="text-right">Target</th>
                      <th className="text-right">Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-sidebar">Contacts</td>
                      <td className="px-4 py-3 text-right text-slate-600">{campaign.campaign_target_contacts ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium">{performance.contactsTargeted ?? 0}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-semibold text-sidebar">Opportunities</td>
                      <td className="px-4 py-3 text-right text-slate-600">{campaign.campaign_target_opportunities ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium">{performance.opportunitiesLinked ?? 0}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-semibold text-sidebar">Leads</td>
                      <td className="px-4 py-3 text-right text-slate-600">{campaign.campaign_target_leads ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-400">Not tracked</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-semibold text-sidebar">Revenue</td>
                      <td className="px-4 py-3 text-right text-slate-600">{money(campaign.campaign_expected_revenue)}</td>
                      <td className="px-4 py-3 text-right text-slate-400">Not tracked</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">What is not measured yet</p>
                <p>Leads are not a CRM record type here, so only a lead target can be stored.</p>
                <p>Opportunities have no value column, so attributed revenue cannot be calculated or shown.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddCampaignModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={fetchCampaign}
        campaignToEdit={campaign}
      />
    </div>
  );
};

export default CampaignDetail;
