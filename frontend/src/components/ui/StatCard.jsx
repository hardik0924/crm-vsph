const StatCard = ({ label, value, tone }) => (
  <div className="card border-border p-4">
    <p className="text-[10px] font-semibold text-secondary uppercase tracking-wider">{label}</p>
    <p className={`text-2xl font-bold leading-none mt-1 ${tone || "text-sidebar"}`}>{value ?? "—"}</p>
  </div>
);

export default StatCard;
