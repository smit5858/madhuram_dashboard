import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "../../store/store";
import { logout } from "../../store/slices/authSlice";
import LOGO from "@/assets/logo.jpg";

// Map paths to beautiful SVG icons
const getIconForRoute = (path: string) => {
    const p = path.toLowerCase();
    if (p.includes("dashboard")) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
        );
    }
    if (p.includes("couriers")) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124l-.304-4.822a4.878 4.878 0 00-1.258-2.677L17.18 6.75H11.25v12m-9-4.5H18.75M2.25 14.25h16.5V11.25H2.25v3z" />
            </svg>
        );
    }
    if (p.includes("users")) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 20.8M15 19.128l-.071-.003c-.022-.008-.045-.015-.067-.023a9.935 9.935 0 00-2.842-.716M9.911 20.8A11.386 11.386 0 015 19.237v-.111c0-1.113.285-2.16.786-3.07M9.911 20.8L10 20.803c.022-.008.045-.015.067-.023a9.935 9.935 0 002.842-.716M5.089 19.237a9.38 9.38 0 01-2.625.372 9.337 9.337 0 01-4.121-.952 4.125 4.125 0 017.533-2.493M15 9.75a3 3 0 11-6 0 3 3 0 016 0zM4.625 9.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
        );
    }
    // Default chart/report icon
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
        </svg>
    );
};

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();

    const { allowedRoutes, name, role } = useSelector(
        (state: RootState) => state.auth
    );

    const handleLogout = () => {
        dispatch(logout());
        navigate("/");
    };

    return (
        <div className="flex h-screen w-75 flex-col justify-between border-r border-[#e0e0e0] bg-[#1e293b] text-slate-300">
            <div>
                {/* Branding/Header */}
                <div className="flex items-center gap-3 border-b border-slate-700 px-6 py-5">
                    <img
                        src={LOGO}
                        alt="Madhuram Motors Logo"
                        className="h-10 w-10 rounded-full object-cover border-2 border-blue-500"
                    />
                    <div>
                        <h2 className="text-base font-bold text-white tracking-wide">
                            Madhuram Motors
                        </h2>
                        <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">
                            CRM Dashboard
                        </span>
                    </div>
                </div>

                {/* Navigation Menu */}
                <nav className="mt-6 px-4 space-y-1.5">
                    {allowedRoutes && allowedRoutes.length > 0 ? (
                        allowedRoutes.map((route:any) => {
                            const isActive = location.pathname.toLowerCase() === route.path.toLowerCase();

                            return (
                                <NavLink
                                    key={route.id}
                                    to={route.path}
                                    className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-150 ${
                                        isActive
                                            ? "bg-[#3d6fe0] text-white shadow-md shadow-blue-500/20"
                                            : "hover:bg-slate-800 hover:text-white"
                                    }`}
                                >
                                    {getIconForRoute(route.path)}
                                    <span>{route.name}</span>
                                </NavLink>
                            );
                        })
                    ) : (
                        <div className="px-4 py-3 text-xs text-slate-500">
                            No menu routes loaded.
                        </div>
                    )}
                </nav>
            </div>

            {/* Profile & Logout Footer */}
            <div className="border-t border-slate-700 p-4">
                <div className="flex items-center justify-between rounded-lg bg-slate-800/60 p-3">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                            {name || "Loading User..."}
                        </p>
                        <p className="text-xs text-blue-400 font-medium capitalize">
                            Role: {role || "Staff"}
                        </p>
                    </div>

                    <button
                        onClick={handleLogout}
                        title="Logout"
                        className="ml-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="h-5 w-5"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;