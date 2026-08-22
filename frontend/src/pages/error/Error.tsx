import { useNavigate, useRouteError } from "react-router-dom";

const Error = () => {
    const navigate = useNavigate();
    const error: any = useRouteError();

    const isChunkLoadError =
        error?.message?.includes(
            "Failed to fetch dynamically imported module"
        ) ||
        error?.stack?.includes("ChunkLoadError") ||
        (error?.name === "TypeError" &&
            error?.message?.includes("dynamically imported module"));

    const handleReload = () => {
        window.location.reload();
    };

    const handleDashboard = () => {
        navigate("/");
    };

    return (
        <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--bg-page)", color: "var(--text-page)" }}>
            {/* Background */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-red-500/10 blur-3xl" />
                <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

                <div
                    className="absolute inset-0 opacity-[0.035]"
                    style={{
                        backgroundImage:
                            "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                    }}
                />
            </div>

            {/* Main */}
            <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
                <div className="w-full max-w-3xl">
                    {/* Status */}
                    <div className="mb-5 flex items-center justify-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                        </span>

                        <span className="text-xs font-medium uppercase tracking-[0.25em] text-red-400">
                            System Fault Detected
                        </span>
                    </div>

                    {/* Card */}
                    <div className="overflow-hidden rounded-2xl backdrop-blur-xl shadow-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                        {/* Top bar */}
                        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-color)" }}>
                            <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                            </div>

                            <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-500">
                                AutoDiag CRM / Diagnostic Console
                            </div>
                        </div>

                        <div className="px-6 py-10 sm:px-10 sm:py-14">
                            {/* Error Icon */}
                            <div className="mx-auto mb-7 flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
                                <svg
                                    className="h-10 w-10 text-red-400"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 9v4m0 4h.01M10.34 3.94 2.93 17a2 2 0 0 0 1.74 3h14.66a2 2 0 0 0 1.74-3L13.66 3.94a2 2 0 0 0-3.32 0Z"
                                    />
                                </svg>
                            </div>

                            {/* Heading */}
                            <div className="text-center">
                                <p className="mb-2 font-mono text-sm text-red-400">
                                    DTC: UI-500
                                </p>

                                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                                    Diagnostic System Fault
                                </h1>

                                <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
                                    The CRM encountered an unexpected problem
                                    while loading this module. Your data is
                                    safe, but this diagnostic screen could not
                                    be initialized correctly.
                                </p>
                            </div>

                            {/* Diagnostic Info */}
                            <div className="mx-auto mt-8 max-w-xl overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/20">
                                <div className="grid grid-cols-1 divide-y divide-black/10 dark:divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                                    <div className="p-4">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                            Module
                                        </p>
                                        <p className="mt-1 truncate font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                                            {isChunkLoadError
                                                ? "Dynamic Module"
                                                : "CRM Dashboard"}
                                        </p>
                                    </div>

                                    <div className="p-4">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                            Status
                                        </p>
                                        <p className="mt-1 font-mono text-xs text-red-400">
                                            OFFLINE
                                        </p>
                                    </div>

                                    <div className="p-4">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                            Error
                                        </p>
                                        <p className="mt-1 font-mono text-xs text-slate-300">
                                            {isChunkLoadError
                                                ? "MODULE_LOAD"
                                                : "UNEXPECTED"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Chunk Load Message */}
                            {isChunkLoadError && (
                                <div className="mx-auto mt-5 flex max-w-xl gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                                    <svg
                                        className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M12 9v3m0 4h.01M10.29 3.86l-8.1 14a2 2 0 0 0 1.73 3h12.16a2 2 0 0 0 1.73-3l-8.1-14a2 2 0 0 0-3.42 0Z"
                                        />
                                    </svg>

                                    <div>
                                        <p className="text-sm font-medium text-yellow-300">
                                            Module update detected
                                        </p>

                                        <p className="mt-1 text-xs leading-5 text-yellow-200/60">
                                            This usually happens when a new
                                            version of the dashboard has been
                                            deployed. Reload the application to
                                            fetch the latest modules.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                                <button
                                    onClick={handleReload}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-slate-900 transition hover:bg-slate-700 dark:hover:bg-slate-200 active:scale-[0.98]"
                                >
                                    <svg
                                        className="h-4 w-4"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M4 4v5h5M20 20v-5h-5M5.5 9A7 7 0 0 1 17 5.5L20 9M4 15l3 3.5A7 7 0 0 0 18.5 15"
                                        />
                                    </svg>
                                    Reconnect & Reload
                                </button>

                                <button
                                    onClick={handleDashboard}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-black/10 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white active:scale-[0.98]"
                                >
                                    Back to Dashboard
                                </button>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/10 px-6 py-4">
                            <div className="flex flex-col items-center justify-between gap-2 text-[10px] text-slate-600 sm:flex-row">
                                <span className="font-mono">
                                    DIAGNOSTIC CONSOLE
                                </span>

                                <span className="font-mono">
                                    SYSTEM :: AUTO_RECOVERY_AVAILABLE
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Bottom message */}
                    <p className="mt-5 text-center text-xs text-slate-600">
                        No vehicle or customer records were modified by this
                        error.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Error;