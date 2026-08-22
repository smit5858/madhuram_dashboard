import { useNavigate } from "react-router-dom";

const Forbidden = () => {
    const navigate = useNavigate();

    return (
        <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
            <div className="w-full max-w-lg rounded-2xl border border-red-500/10 bg-white/60 p-8 text-center backdrop-blur-xl shadow-xl dark:bg-slate-900/60">
                {/* Lock icon */}
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="h-10 w-10 animate-pulse"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                        />
                    </svg>
                </div>

                {/* Status code */}
                <span className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-red-500">
                    Error Code: 403 Forbidden
                </span>

                <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Access Denied
                </h1>

                <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Your authenticated role does not have authorization to view this resource. 
                    Please contact an administrator if you believe this is an error.
                </p>

                {/* Action buttons */}
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <button
                        onClick={() => navigate("/dashboard")}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3162d2] active:scale-[0.98]"
                    >
                        Return to Dashboard
                    </button>
                    <button
                        onClick={() => navigate(-1)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Forbidden;
