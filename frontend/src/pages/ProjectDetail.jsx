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
import ActivityFeed from "../components/ActivityFeed";
import AddProjectModal from "../components/modals/AddProjectModal";
import { api } from "../utils/api";
import { canDoAction } from "../utils/modules";
import {
  PROJECT_STATUS_STYLES,
  dateOnly,
  projectStatusLabel,
  projectTypeLabel,
} from "../utils/projects";
import toast from "react-hot-toast";

const OPP_STAGE_STYLES = {
  PITCH_DONE: "bg-vsph-core-blue text-white",
  FOLLOW_UP: "bg-vsph-light-blue text-vsph-navy",
  CONTRACT_OUT: "bg-amber-400 text-white",
  CLOSED_WON: "bg-emerald-500 text-white",
  CLOSED_LOST: "bg-rose-500 text-white",
  UNASSIGNED: "bg-slate-300 text-slate-600",
};

const card = "bg-white border border-border rounded-lg";
const fieldLabel = "text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1";
const inputClass =
  "w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsph-core-blue";

const contactName = (contact) =>
  `${contact.contact_firstname || ""} ${contact.contact_lastname || ""}`.trim() || "Unnamed contact";

const projectTitle = (project) =>
  project.project_name || `Project (${project.project_location || "no location"})`;

const Info = ({ label, value }) => (
  <div className="flex flex-col">
    <span className={fieldLabel}>{label}</span>
    <span className="text-[13px] font-semibold text-slate-700">
      {value === null || value === undefined || value === "" ? "—" : value}
    </span>
  </div>
);

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const canEdit = canDoAction("PROJECTS", "EDIT");
  const canDelete = canDoAction("PROJECTS", "DELETE");

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [contactFilter, setContactFilter] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactMatches, setContactMatches] = useState([]);
  const [searchingContacts, setSearchingContacts] = useState(false);

  const [oppQuery, setOppQuery] = useState("");
  const [oppMatches, setOppMatches] = useState([]);
  const [searchingOpps, setSearchingOpps] = useState(false);

  const fetchProject = async () => {
    setLoading((current) => current || !project);
    try {
      const response = await api.get(`/api/projects/${id}`);
      if (response.success) {
        setProject(response.data);
        setError("");
      } else {
        setProject(null);
        setError(response.message || "Project not found.");
      }
    } catch {
      setError("Could not reach the CRM API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setProject(null);
    setError("");
    setLoading(true);
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab !== "contacts") return;
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
    () => new Set((project?.contacts || []).map((contact) => contact.contact_id)),
    [project]
  );
  const linkedOpportunityIds = useMemo(
    () => new Set((project?.opportunities || []).map((opportunity) => opportunity.opportunity_id)),
    [project]
  );

  const contacts = useMemo(() => {
    const query = contactFilter.trim().toLowerCase();
    if (!query) return project?.contacts || [];
    return (project?.contacts || []).filter((contact) =>
      [contactName(contact), contact.contact_professional_email, contact.account?.account_name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [project, contactFilter]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-page-bg">
        <Loader2 className="animate-spin text-vsph-core-blue" size={28} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-page-bg">
        <p className="text-sm font-semibold text-slate-600">{error || "Project not found."}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={fetchProject}>
            <RefreshCw size={14} className="mr-1.5" /> Retry
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate("/v2/projects")}>
            Back to projects
          </Button>
        </div>
      </div>
    );
  }

  const accountsReached = [
    ...new Set((project.contacts || []).map((contact) => contact.account?.account_name).filter(Boolean)),
  ];

  const handleDelete = async () => {
    if (!window.confirm(`Delete project "${projectTitle(project)}"? Linked contacts and opportunities are kept.`)) {
      return;
    }
    const response = await api.post("/api/projects/delete", { ids: [project.project_id] });
    if (response.success) {
      toast.success("Project deleted");
      navigate("/v2/projects");
    } else {
      toast.error(response.message || "Could not delete project");
    }
  };

  const addContact = async (contact) => {
    setBusy(true);
    const response = await api.post(`/api/projects/${project.project_id}/contacts`, {
      contact_ids: [contact.contact_id],
    });
    setBusy(false);
    if (response.success) {
      toast.success(
        response.data?.skipped ? "Contact is already in another project" : "Contact added to project"
      );
      setContactQuery("");
      setContactMatches([]);
      fetchProject();
    } else {
      toast.error(response.message || "Could not add contact");
    }
  };

  const removeContact = async (contact) => {
    if (!window.confirm(`Remove ${contactName(contact)} from this project? The contact record is kept.`)) return;
    setBusy(true);
    const response = await api.delete(`/api/projects/${project.project_id}/contacts/${contact.contact_id}`);
    setBusy(false);
    if (response.success) {
      toast.success("Contact removed from project");
      fetchProject();
    } else {
      toast.error(response.message || "Could not remove contact");
    }
  };

  const addOpportunity = async (opportunity) => {
    setBusy(true);
    const response = await api.post(`/api/projects/${project.project_id}/opportunities`, {
      opportunity_ids: [opportunity.opportunity_id],
    });
    setBusy(false);
    if (response.success) {
      toast.success(
        response.data?.skipped ? "Opportunity is already in another project" : "Opportunity linked to project"
      );
      setOppQuery("");
      setOppMatches([]);
      fetchProject();
    } else {
      toast.error(response.message || "Could not link opportunity");
    }
  };

  const removeOpportunity = async (opportunity) => {
    if (!window.confirm(`Remove "${opportunity.opportunity_name}" from this project? The opportunity record is kept.`)) {
      return;
    }
    setBusy(true);
    const response = await api.delete(
      `/api/projects/${project.project_id}/opportunities/${opportunity.opportunity_id}`
    );
    setBusy(false);
    if (response.success) {
      toast.success("Opportunity removed from project");
      fetchProject();
    } else {
      toast.error(response.message || "Could not remove opportunity");
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "contacts", label: `Contacts (${project.contacts?.length || 0})` },
    { id: "opportunities", label: `Opportunities (${project.opportunities?.length || 0})` },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="flex flex-col h-full bg-page-bg animate-fade-in">
      <div className="surface border-b border-border px-8 py-5 shrink-0">
        <Breadcrumbs
          items={[
            { label: "Projects", path: "/v2/projects" },
            { label: projectTitle(project), current: true },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4 mt-2">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-sidebar text-2xl font-bold tracking-tight">{projectTitle(project)}</h1>
              <span
                className={`inline-flex px-2 py-1 rounded border text-[10px] font-semibold ${
                  PROJECT_STATUS_STYLES[project.project_is_active] || PROJECT_STATUS_STYLES.INACTIVE
                }`}
              >
                {projectStatusLabel(project.project_is_active)}
              </span>
            </div>
            <p className="text-secondary text-sm font-medium mt-1">
              {projectTypeLabel(project.project_type)} · {project.project_location || "No location"}
              {project.project_date ? ` · ${dateOnly(project.project_date)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate("/v2/projects")}>
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
                <Info label="Location" value={project.project_location} />
                <Info label="Type" value={projectTypeLabel(project.project_type)} />
                <Info label="Status" value={projectStatusLabel(project.project_is_active)} />
                <Info label="Project date" value={dateOnly(project.project_date)} />
                <Info label="Created" value={dateOnly(project.project_created_at)} />
                <Info label="Updated" value={dateOnly(project.project_updated_at)} />
                <Info label="Contacts linked" value={project.contacts?.length || 0} />
                <Info label="Opportunities linked" value={project.opportunities?.length || 0} />
                <Info label="Accounts reached" value={accountsReached.length} />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                Projects group contacts and opportunities. Tasks are not linked to projects — they belong to a
                contact or a campaign.
              </div>
            </div>
          )}

          {tab === "contacts" && (
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-80">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={contactFilter}
                    onChange={(event) => setContactFilter(event.target.value)}
                    placeholder="Filter linked contacts…"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <span className="text-xs text-slate-500">{project.contacts?.length || 0} linked</span>
              </div>

              {canEdit && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Plus size={14} /> Add contacts to this project
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

              {contacts.length === 0 ? (
                <div className="py-14 text-center text-sm text-slate-500">
                  <Users size={36} className="mx-auto text-slate-200 mb-2" />
                  {project.contacts?.length === 0
                    ? "No contacts are linked to this project yet."
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
                      {contacts.map((contact) => (
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
                                  title="Remove from project"
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
                    <Plus size={14} /> Link an opportunity to this project
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

              {project.opportunities?.length === 0 ? (
                <div className="py-14 text-center text-sm text-slate-500">
                  No opportunities are linked to this project yet.
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
                      {project.opportunities.map((opportunity) => (
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
                                  title="Remove from project"
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

          {tab === "activity" && (
            <div className="p-6">
              <ActivityFeed entity="project" id={project.project_id} />
            </div>
          )}
        </div>
      </div>

      <AddProjectModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={fetchProject}
        projectToEdit={project}
      />
    </div>
  );
};

export default ProjectDetail;
