import { useSelector } from "react-redux";
import type { RootState } from "@/store/store";
import AdminDashboard from "./AdminDashboard";
import AccountsDashboard from "./AccountsDashboard";
import SalesDashboard from "./SalesDashboard";
import CourierDashboard from "./CourierDashboard";
import HRDashboard from "./HRDashboard";
import LeadsDashboard from "./LeadsDashboard";
import RolePlaceholder from "./components/RolePlaceholder";

// Single /dashboard route, content branches by role — see components/RolePlaceholder.tsx for
// why every not-yet-built role lands there instead of a per-role stub. Role names are the
// free-text strings created via Settings → Role Management, not a fixed enum.
const Dashboard = () => {
    const { role } = useSelector((state: RootState) => state.auth);

    if (role === "Admin") return <AdminDashboard />;
    if (role === "Account") return <AccountsDashboard />;
    if (role === "Sells") return <SalesDashboard />;
    if (role === "Courier") return <CourierDashboard />;
    if (role === "HR") return <HRDashboard />;
    if (role === "Sales Employee") return <LeadsDashboard />;

    return <RolePlaceholder role={role} />;
};

export default Dashboard;
