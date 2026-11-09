import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2, Users } from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { api } from "../../utils/api";
import {
  CAMPAIGN_PRIORITIES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  isCampaignManager,
} from "../../utils/campaigns";
import toast from "react-hot-toast";

const emptyForm = {
  campaign_name: "",
  campaign_code: "",
  campaign_type: "OTHER",
  campaign_status: "DRAFT",
  campaign_priority: "NORMAL",
  campaign_objective: "",
  campaign_description: "",
  campaign_start_date: "",
  campaign_end_date: "",
  campaign_launch_date: "",
  campaign_planned_budget: "",
  campaign_actual_cost: "",
  campaign_expected_revenue: "",
  campaign_target_contacts: "",
  campaign_target_leads: "",
  campaign_target_opportunities: "",
  campaign_user_fk: "",
};

const inputClass =
  "w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsph-core-blue focus-visible:border-vsph-core-blue";

const day = (value) => (value ? String(value).slice(0, 10) : "");
const contactLabel = (contact) =>
  `${contact.contact_firstname || ""} ${contact.contact_lastname || ""}`.trim() || "Unnamed contact";

const Section = ({ title, hint, children }) => (
  <section className="bg-slate-50/70 p-5 rounded-lg border border-slate-200">
    <h3 className="text-sm font-semibold text-vsph-navy mb-1 flex items-center gap-2">
      <span className="w-1.5 h-4 bg-vsph-core-blue rounded-full" />
      {title}
    </h3>
    {hint && <p className="text-xs text-slate-500 mb-4">{hint}</p>}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
  </section>
);

const Field = ({ label, required, children, full }) => (
  <label className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
    <span className="text-xs font-semibold text-slate-700">
      {label}
      {required ? " *" : ""}
    </span>
    {children}
  </label>
);

const AddCampaignModal = ({ isOpen, onClose, onSuccess, campaignToEdit }) => {
  const manager = isCampaignManager();
  const [formData, setFormData] = useState(emptyForm);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedContacts, setSelectedContacts] = useState([]);
  const [originalContactIds, setOriginalContactIds] = useState([]);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState([]);
  const [searchingContacts, setSearchingContacts] = useState(false);

  const selectedIds = useMemo(
    () => new Set(selectedContacts.map((contact) => contact.contact_id)),
    [selectedContacts]
  );

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setContactQuery("");
    setContactResults([]);

    if (campaignToEdit) {
      setFormData({
        ...emptyForm,
        ...Object.fromEntries(
          Object.keys(emptyForm).map((key) => [key, campaignToEdit[key] ?? emptyForm[key]])
        ),
        campaign_start_date: day(campaignToEdit.campaign_start_date),
        campaign_end_date: day(campaignToEdit.campaign_end_date),
        campaign_launch_date: day(campaignToEdit.campaign_launch_date),
        campaign_user_fk: campaignToEdit.campaign_user_fk || "",
      });
      api.get(`/api/campaigns/${campaignToEdit.campaign_id}`).then((res) => {
        if (res.success) {
          const contacts = res.data.contacts || [];
          setSelectedContacts(contacts);
          setOriginalContactIds(contacts.map((contact) => contact.contact_id));
        }
      });
    } else {
      setFormData({
        ...emptyForm,
        campaign_user_fk: localStorage.getItem("vsph_user_id") || "",
      });
      setSelectedContacts([]);
      setOriginalContactIds([]);
    }
  }, [isOpen, campaignToEdit]);

  useEffect(() => {
    if (!isOpen) return;
    api
      .get("/api/users?limit=100")
      .then((res) => {
        if (res.success) setUsers(res.data || []);
      })
      .catch(() => setUsers([]));
  }, [isOpen]);

  // Search is debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!isOpen) return;
    const query = contactQuery.trim();
    if (query.length < 2) {
      setContactResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingContacts(true);
      try {
        const res = await api.get(`/api/contacts?limit=10&search=${encodeURIComponent(query)}`);
        if (res.success) setContactResults(res.data || []);
      } catch {
        setContactResults([]);
      } finally {
        setSearchingContacts(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [isOpen, contactQuery]);

  if (!isOpen) return null;

  const update = (event) => {
    setFormData((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const addContact = (contact) => {
    setSelectedContacts((current) =>
      current.some((row) => row.contact_id === contact.contact_id) ? current : [...current, contact]
    );
    setContactQuery("");
    setContactResults([]);
  };

  const removeContact = (contactId) =>
    setSelectedContacts((current) => current.filter((row) => row.contact_id !== contactId));

  const validate = () => {
    if (!formData.campaign_name.trim()) return "Campaign name is required.";
    if (formData.campaign_code && !/^[A-Za-z0-9_-]{2,40}$/.test(formData.campaign_code.trim())) {
      return "Campaign code must be 2-40 characters using letters, numbers, hyphens or underscores.";
    }
    if (
      formData.campaign_start_date &&
      formData.campaign_end_date &&
      formData.campaign_end_date < formData.campaign_start_date
    ) {
      return "End date cannot be earlier than the start date.";
    }
    if (
      ["ACTIVE", "COMPLETED"].includes(formData.campaign_status) &&
      !formData.campaign_start_date
    ) {
      return "Add a start date before marking a campaign active or completed.";
    }
    const numbers = [
      ["campaign_planned_budget", "Planned budget"],
      ["campaign_actual_cost", "Actual cost"],
      ["campaign_expected_revenue", "Expected revenue"],
      ["campaign_target_contacts", "Target contacts"],
      ["campaign_target_leads", "Target leads"],
      ["campaign_target_opportunities", "Target opportunities"],
    ];
    for (const [field, label] of numbers) {
      const raw = formData[field];
      if (raw === "" || raw === null) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) return `${label} must be zero or more.`;
      if (field.startsWith("campaign_target") && !Number.isInteger(value)) {
        return `${label} must be a whole number.`;
      }
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const invalid = validate();
    if (invalid) {
      setError(invalid);
      toast.error(invalid);
      return;
    }

    setLoading(true);
    setError("");

    const payload = { ...formData };
    if (!manager) {
      // Non-admins cannot change financials or reassign ownership.
      delete payload.campaign_planned_budget;
      delete payload.campaign_actual_cost;
      delete payload.campaign_expected_revenue;
      delete payload.campaign_user_fk;
    }

    try {
      const response = campaignToEdit
        ? await api.put(`/api/campaigns/${campaignToEdit.campaign_id}`, payload)
        : await api.post("/api/campaigns", payload);

      if (!response.success) {
        setError(response.message || "Failed to save campaign.");
        toast.error(response.message || "Failed to save campaign.");
        return;
      }

      const saved = response.data;
      if (selectedContacts.length > 0) {
        const addIds = campaignToEdit
          ? selectedContacts
              .map((contact) => contact.contact_id)
              .filter((id) => !originalContactIds.includes(id))
          : selectedContacts.map((contact) => contact.contact_id);
        const removeIds = campaignToEdit
          ? originalContactIds.filter((id) => !selectedIds.has(id))
          : [];

        if (addIds.length > 0) {
          const linked = await api.post(`/api/campaigns/${saved.campaign_id}/contacts`, {
            contact_ids: addIds,
          });
          if (!linked.success) {
            toast.error(linked.message || "Campaign saved, but contacts could not be linked.");
          } else if (linked.data?.skipped > 0) {
            toast(`${linked.data.skipped} contact(s) skipped because they are already in another campaign.`);
          }
        }
        await Promise.all(
          removeIds.map((id) => api.delete(`/api/campaigns/${saved.campaign_id}/contacts/${id}`))
        );
      } else if (campaignToEdit && originalContactIds.length > 0) {
        await Promise.all(
          originalContactIds.map((id) =>
            api.delete(`/api/campaigns/${saved.campaign_id}/contacts/${id}`)
          )
        );
      }

      toast.success(campaignToEdit ? "Campaign updated" : "Campaign created");
      onSuccess?.(saved);
      onClose();
    } catch {
      setError("Could not reach the CRM API. Your entries are kept.");
    } finally {
      setLoading(false);
    }
  };

  const footerActions = (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="campaign-form"
        variant="primary"
        disabled={loading}
        className="min-w-[140px]"
      >
        {loading && <Loader2 size={16} className="animate-spin mr-2" />}
        {loading ? "Saving…" : campaignToEdit ? "Save changes" : "Create campaign"}
      </Button>
    </>
  );

  const ownerName = users.find((user) => user.user_id === formData.campaign_user_fk)?.user_name;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={campaignToEdit ? "Edit campaign" : "New campaign"}
      widthClass="w-full max-w-3xl"
      footer={footerActions}
    >
      <form id="campaign-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="m-6 mb-0 p-3 bg-rose-50 text-rose-700 text-sm rounded-lg border border-rose-100">
            {error}
          </div>
        )}

        <div className="space-y-5 p-6 max-h-[70vh] overflow-y-auto">
          <Section title="Basic details">
            <Field label="Campaign name" required>
              <input
                type="text"
                name="campaign_name"
                required
                value={formData.campaign_name}
                onChange={update}
                className={inputClass}
                placeholder="e.g. Q3 product launch"
              />
            </Field>
            <Field label="Campaign code">
              <input
                type="text"
                name="campaign_code"
                value={formData.campaign_code}
                onChange={update}
                className={inputClass}
                placeholder="e.g. Q3-LAUNCH"
              />
            </Field>
            <Field label="Type" required>
              <select name="campaign_type" value={formData.campaign_type} onChange={update} className={inputClass}>
                {CAMPAIGN_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Status" required>
              <select name="campaign_status" value={formData.campaign_status} onChange={update} className={inputClass}>
                {CAMPAIGN_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select name="campaign_priority" value={formData.campaign_priority} onChange={update} className={inputClass}>
                {CAMPAIGN_PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>{priority.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Owner">
              {manager ? (
                <select name="campaign_user_fk" value={formData.campaign_user_fk} onChange={update} className={inputClass}>
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>{user.user_name}</option>
                  ))}
                </select>
              ) : (
                <input type="text" readOnly value={ownerName || "You"} className={`${inputClass} bg-slate-100`} />
              )}
            </Field>
            <Field label="Objective" full>
              <input
                type="text"
                name="campaign_objective"
                value={formData.campaign_objective}
                onChange={update}
                className={inputClass}
                placeholder="What should this campaign achieve?"
              />
            </Field>
            <Field label="Description" full>
              <textarea
                name="campaign_description"
                rows={3}
                value={formData.campaign_description}
                onChange={update}
                className={inputClass}
                placeholder="Channels, messaging and notes"
              />
            </Field>
          </Section>

          <Section title="Schedule" hint="End date must be on or after the start date.">
            <Field label="Start date">
              <input type="date" name="campaign_start_date" value={formData.campaign_start_date} onChange={update} className={inputClass} />
            </Field>
            <Field label="End date">
              <input type="date" name="campaign_end_date" value={formData.campaign_end_date} onChange={update} className={inputClass} />
            </Field>
            <Field label="Actual launch date">
              <input type="date" name="campaign_launch_date" value={formData.campaign_launch_date} onChange={update} className={inputClass} />
            </Field>
          </Section>

          <Section
            title="Performance targets"
            hint="Manually set the goals you want this campaign to reach. Actuals are computed from linked contacts and opportunities on the campaign detail page."
          >
            <Field label="Target contacts">
              <input type="number" min="0" step="1" name="campaign_target_contacts" value={formData.campaign_target_contacts} onChange={update} className={inputClass} />
            </Field>
            <Field label="Target leads">
              <input type="number" min="0" step="1" name="campaign_target_leads" value={formData.campaign_target_leads} onChange={update} className={inputClass} />
            </Field>
            <Field label="Target opportunities">
              <input type="number" min="0" step="1" name="campaign_target_opportunities" value={formData.campaign_target_opportunities} onChange={update} className={inputClass} />
            </Field>
          </Section>

          {manager && (
            <Section
              title="Budget"
              hint="Amounts are optional and stored as plain numbers in the organization's currency."
            >
              <Field label="Planned budget">
                <input type="number" min="0" step="0.01" name="campaign_planned_budget" value={formData.campaign_planned_budget} onChange={update} className={inputClass} />
              </Field>
              <Field label="Actual cost">
                <input type="number" min="0" step="0.01" name="campaign_actual_cost" value={formData.campaign_actual_cost} onChange={update} className={inputClass} />
              </Field>
              <Field label="Expected revenue">
                <input type="number" min="0" step="0.01" name="campaign_expected_revenue" value={formData.campaign_expected_revenue} onChange={update} className={inputClass} />
              </Field>
            </Section>
          )}

          <Section
            title="Target audience"
            hint="Linking adds contacts to this campaign. It does not send any email or message."
          >
            <div className="md:col-span-2 space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={contactQuery}
                  onChange={(event) => setContactQuery(event.target.value)}
                  className={`${inputClass} pl-9`}
                  placeholder="Search contacts by name, code or email…"
                />
                {searchingContacts && (
                  <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
                )}
              </div>

              {contactQuery.trim().length >= 2 && (
                <div className="border border-slate-200 rounded-md bg-white max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {contactResults.filter((contact) => !selectedIds.has(contact.contact_id)).length === 0 ? (
                    <p className="p-3 text-xs text-slate-500">
                      {searchingContacts ? "Searching…" : "No matching contacts."}
                    </p>
                  ) : (
                    contactResults
                      .filter((contact) => !selectedIds.has(contact.contact_id))
                      .map((contact) => (
                        <button
                          type="button"
                          key={contact.contact_id}
                          onClick={() => addContact(contact)}
                          className="w-full text-left px-3 py-2 hover:bg-vsph-light-blue/30 flex items-center justify-between gap-3"
                        >
                          <span>
                            <span className="block text-sm font-medium text-slate-800">{contactLabel(contact)}</span>
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

              <div>
                <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mb-2">
                  <Users size={14} /> Selected contacts ({selectedContacts.length})
                </p>
                {selectedContacts.length === 0 ? (
                  <p className="text-xs text-slate-500">No contacts selected yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedContacts.map((contact) => (
                      <span
                        key={contact.contact_id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-700"
                      >
                        {contactLabel(contact)}
                        <button
                          type="button"
                          onClick={() => removeContact(contact.contact_id)}
                          className="text-slate-400 hover:text-rose-600"
                          aria-label={`Remove ${contactLabel(contact)}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>
        </div>
      </form>
    </Modal>
  );
};

export default AddCampaignModal;
