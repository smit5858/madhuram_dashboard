import React from "react";
import { Field, useFormikContext } from "formik";
import FormikCheckbox from "./formik-fields/FormikCheckbox";

interface PermissionEntry {
  routeId: number;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  viewAllRecords: boolean;
}

export interface PermissionGridRouteMeta {
  routeId: number;
  routeName: string;
  /** Parent grouping label (e.g. "Courier", "Account", "Setting") — rows with no module render
   * flat, exactly as before this existed. Rows sharing a module are grouped under one bold
   * section header, in first-appearance order. */
  module?: string | null;
  /** Shows a "Custom" badge — only meaningful for per-user overrides, omit otherwise */
  isOverride?: boolean;
  /**
   * Overrides the "View All Records" tooltip on this row's 5th-column checkbox. Used by Role
   * Management, which repurposes the shared viewAllRecords column as "Assign Role to User" —
   * see role.routes.js#authorizeAssignRole. The column header stays generic since it's shared
   * across every route row in the grid.
   */
  fifthColumnHint?: string;
}

interface PermissionGridProps {
  routesMeta: PermissionGridRouteMeta[];
}

/**
 * Checkbox grid of routes × View/Add/Edit/Delete/View All, driven by Formik context.
 * Used by the per-user (Route Setting) permission editor, which provides a
 * `{ permissions: PermissionEntry[] }` Formik form with matching field names.
 */
interface GridRow {
  perm: PermissionEntry;
  index: number;
  routeMeta?: PermissionGridRouteMeta;
}

interface GridGroup {
  module: string | null;
  rows: GridRow[];
}

// Groups rows by routeMeta.module, preserving first-appearance order. Rows with no module each
// get their own single-row "group" so they render exactly as flat rows, unchanged from before
// grouping existed.
const groupRows = (rows: GridRow[]): GridGroup[] => {
  const groups: GridGroup[] = [];
  const indexByModule = new Map<string, number>();

  for (const row of rows) {
    const mod = row.routeMeta?.module || null;
    if (!mod) {
      groups.push({ module: null, rows: [row] });
      continue;
    }
    const existingIndex = indexByModule.get(mod);
    if (existingIndex === undefined) {
      indexByModule.set(mod, groups.length);
      groups.push({ module: mod, rows: [row] });
    } else {
      groups[existingIndex].rows.push(row);
    }
  }

  return groups;
};

const PermissionGrid = ({ routesMeta }: PermissionGridProps) => {
  const { values } = useFormikContext<{ permissions: PermissionEntry[] }>();

  const groups = groupRows(
    values.permissions.map((perm, index) => ({
      perm,
      index,
      routeMeta: routesMeta.find((r) => r.routeId === perm.routeId),
    }))
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-xs text-slate-600">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
          <tr>
            <th className="px-4 py-3">Route / Module</th>
            <th className="px-3 py-3 text-center">View</th>
            <th className="px-3 py-3 text-center">Add</th>
            <th className="px-3 py-3 text-center">Edit</th>
            <th className="px-3 py-3 text-center">Delete</th>
            <th className="px-3 py-3 text-center">View All</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((group, groupIdx) => (
            <React.Fragment key={group.module ?? `flat-${groupIdx}`}>
              {group.module && (
                <tr className="bg-slate-100/80">
                  <td colSpan={6} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    {group.module}
                  </td>
                </tr>
              )}
              {group.rows.map(({ perm, index, routeMeta }) => (
                <tr key={perm.routeId} className="hover:bg-slate-50/80">
                  <td className={`px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap ${group.module ? "pl-8" : ""}`}>
                    {routeMeta?.routeName || perm.routeId}
                    {routeMeta?.isOverride && (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                        Custom
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Field name={`permissions.${index}.canRead`} component={FormikCheckbox} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Field name={`permissions.${index}.canCreate`} component={FormikCheckbox} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Field name={`permissions.${index}.canUpdate`} component={FormikCheckbox} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Field name={`permissions.${index}.canDelete`} component={FormikCheckbox} />
                  </td>
                  <td className="px-3 py-2.5 text-center" title={routeMeta?.fifthColumnHint || "View All Records"}>
                    <Field name={`permissions.${index}.viewAllRecords`} component={FormikCheckbox} />
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PermissionGrid;
