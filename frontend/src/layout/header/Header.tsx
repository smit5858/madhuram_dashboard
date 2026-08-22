import { useLocation } from "react-router-dom";

const Header = () => {
    const location = useLocation();

    const getTitleFromPath = (pathname: string) => {
        const p = pathname.toLowerCase();
        if (p.includes('/users') || p.includes('users')) return 'User Management';
        if (p.includes('/clients') || p.includes('clients')) return 'Client Management';
        if (p.includes('/programs') || p.includes('programs')) return 'Program Management';
        if (p.includes('/dashboard') || p.includes('dashboard')) return 'Dashboard';
        if (p === '/' || p.includes('/home') || p.includes('home')) return 'Home';
        if (p.includes('/attendance') || p.includes('attendance')) return 'Attendance Management';
        // fallback: use first non-empty segment as a capitalized word + ' Management'
        const seg = pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
        if (seg) return `${seg.charAt(0).toUpperCase()}${seg.slice(1)} Management`;
        return 'Management';
    }

    const title = getTitleFromPath(location.pathname);

    // small noun for the subtitle (used in paragraph)
    // const nounForSubtitle = () => {
    //     if (title.includes('User')) return 'users';
    //     if (title.includes('Client')) return 'clients';
    //     if (title.includes('Program')) return 'programs';
    //     if (title.includes('Attendance')) return 'attendance records';
    //     return 'items';
    // }
    const nounForSubtitle = () => {
        if (title.includes('User')) return 'Manage all users in one place. Control access, assign roles, and monitor activity across your platform.';
        if (title.includes('Client')) return 'Client data made simple - track every relationship and record for informed decisions and improved care.';
        if (title.includes('Program')) return 'Effortlessly manage program—enroll, edit, assign, and track every step to ensure the best experience and outcomes for your business.';
        if (title.includes('Attendance')) return 'Effortlessly manage program—enroll, edit, assign, and track every step to ensure the best experience and outcomes for your business.';
        return 'items';
    }

    return (
        <div className="header w-full bg-white">
            <div className="flex items-center justify-between">
                <div className="">
                    <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
                    {/* <p className="text-sm text-gray-500">Manage all {nounForSubtitle()} in one place. Control access, assign roles, and monitor activity across your platform.</p> */}
                    <p className="text-sm text-gray-500">{nounForSubtitle()}</p>
                </div>
                {/* <div className="cursor-pointer hidden">
                    <img src={NotificationBell} alt="Notifications Bell" className="w-full h-full object-contain " />
                </div> */}
            </div>
        </div>
    )
}

export default Header;