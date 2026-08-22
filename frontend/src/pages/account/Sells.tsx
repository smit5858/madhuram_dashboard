import FormikInput from "@/shared/components/formik-fields/FormikInput";
import type { RootState } from "@/store/store";
import { Field, Form, Formik } from "formik";
import { useSelector } from "react-redux";

const Sells = () => {
    const permission = useSelector((state: RootState) => state.auth.permissions);
    const sellsPermission = permission?.find(
        (item) => item.routeName === "Account Sells" || item.routePath === "/account/sells"
    );

    return (
        <div className="p-6 bg-white rounded-xl shadow-md">
            <div className="flex items-center justify-between ">
                <Formik initialValues={{ search: "", start_date: "", end_date: "" }} onSubmit={() => {}}>
                    {() => (
                        <Form className="flex items-center justify-center gap-4">
                            <Field 
                                name="search"
                                type="text"
                                placeholder="Search..."
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                component={FormikInput}
                            />
                            <Field 
                                name="start_date"
                                type="date"
                                placeholder="Start Date"
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                component={FormikInput}
                            />
                            <Field 
                                name="end_date"
                                type="date"
                                placeholder="End Date"
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                component={FormikInput}
                            />
                            <button type="reset" className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                Reset
                            </button>
                        </Form>
                    )}
                </Formik>
                {sellsPermission?.canCreate && (
                    <button className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        Add Sell
                    </button>
                )}
            </div>
            <div className="mt-6">
            {/* Table or list of sells would go here */}
                <table className="min-w-full divide-y divide-gray-200">
                </table>
            </div>
        </div>
    );
};

export default Sells;
