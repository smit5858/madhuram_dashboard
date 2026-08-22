const LoadingFallback = () => (
    <div className="flex h-screen w-screen items-center justify-center bg-[#f3f6ff]">
        <div className="flex flex-col items-center">

            {/* Logo / M Mark */}
            <div className="relative mb-7 flex h-20 w-20 items-center justify-center">

                {/* Outer rotating ring */}
                <div className="absolute inset-0 rounded-full border border-[#3d6fe0]/15" />

                <div className="absolute inset-0 animate-[spin_3s_linear_infinite] rounded-full border border-transparent border-t-[#3d6fe0] border-r-[#3d6fe0]/30" />

                {/* Glow */}
                <div className="absolute h-12 w-12 animate-pulse rounded-full bg-[#3d6fe0]/10 blur-xl" />

                {/* M */}
                <div className="relative text-4xl font-black italic tracking-tighter text-[#3d6fe0]">
                    M
                </div>
            </div>

            {/* Brand */}
            <div className="text-center">
                <div className="text-2xl font-bold tracking-[0.22em] text-[#24345c]">
                    MADHURAM
                </div>

                <div className="mt-1 text-[10px] font-semibold tracking-[0.65em] text-[#3d6fe0]">
                    MOTORS
                </div>
            </div>

            {/* Modern loading line */}
            <div className="mt-8 w-52">
                <div className="relative h-[2px] overflow-hidden rounded-full bg-[#24345c]/10">
                    <div className="absolute inset-y-0 left-0 w-20 animate-[loadingLine_1.4s_ease-in-out_infinite] rounded-full bg-[#3d6fe0]" />
                </div>

                <div className="mt-3 text-center text-[9px] font-medium tracking-[0.4em] text-[#24345c]/40">
                    INITIALIZING
                </div>
            </div>
        </div>

        <style>{`
            @keyframes loadingLine {
                0% {
                    transform: translateX(-120%);
                }
                50% {
                    transform: translateX(180%);
                }
                100% {
                    transform: translateX(300%);
                }
            }
        `}</style>
    </div>
);

export default LoadingFallback;