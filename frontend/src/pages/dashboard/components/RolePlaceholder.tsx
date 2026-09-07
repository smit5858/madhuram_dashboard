import { LayoutDashboard } from "lucide-react";

// Shared "dashboard coming soon" view for every role that doesn't have a built-out dashboard
// yet (HR, Sales, Courier, Common/User). Future passes add a role branch in Dashboard.tsx and
// point it at a new dashboard component — this file stays untouched.
const RolePlaceholder = ({ role }: { role: string | null }) => (
  <div className="p-6 bg-white rounded-xl shadow-md">
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-slate-400">
      <LayoutDashboard className="h-10 w-10 text-slate-300" />
      <p className="text-sm font-medium text-slate-500">
        {role ? `The ${role} dashboard is coming soon.` : "Dashboard coming soon."}
      </p>
      <p className="max-w-xs text-xs text-slate-400">
        Use the sidebar to get to the modules you have access to in the meantime.
      </p>
    </div>
  </div>
);

export default RolePlaceholder;
