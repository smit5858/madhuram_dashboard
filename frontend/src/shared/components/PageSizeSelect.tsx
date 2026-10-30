import { PAGE_SIZE_OPTIONS } from "../constants/pagination";

interface PageSizeSelectProps {
    value: number;
    onChange: (value: number) => void;
    className?: string;
}

/** "N Records" dropdown controlling how many rows each infinite-scroll batch loads. */
const PageSizeSelect = ({ value, onChange, className }: PageSizeSelectProps) => (
    <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Records per batch"
        className={
            className ??
            "rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
        }
    >
        {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
                {size} Records
            </option>
        ))}
    </select>
);

export default PageSizeSelect;
