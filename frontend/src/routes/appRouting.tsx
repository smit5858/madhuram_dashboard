import { lazy, Suspense } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { Routing } from "./routing";
import MainLayout from "@/layout/mainLayout/MainLayout";
import { AuthGuard, PermissionGuard } from "./Guards";

const Error = lazy(() => import('../pages/error/Error'));
const Login = lazy(() => import('../pages/login/Login'));
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));
const Couriers = lazy(() => import('../pages/couriers/Couriers'));
const CourierCompanies = lazy(() => import('../pages/couriers/CourierCompanies'));
const Customers = lazy(() => import('../pages/customers/Customers'));
const Sells = lazy(() => import('../pages/sells/Sells'));
const CustomerLedger = lazy(() => import('../pages/customers/CustomerLedger'));
const Users = lazy(() => import('../pages/users/Users'));
const Products = lazy(() => import('../pages/products/Products'));
const Income = lazy(() => import('../pages/account/Income'));
const Expense = lazy(() => import('../pages/account/Expense'));
const PendingBill = lazy(() => import('../pages/account/PendingBill'));
const Debited = lazy(() => import('../pages/account/Debited'));
const BankAccounts = lazy(() => import('../pages/account/BankAccounts'));
const RouteSetting = lazy(() => import('../pages/settings/RouteSetting'));
const RoleManagement = lazy(() => import('../pages/settings/RoleManagement'));
const Leads = lazy(() => import('../pages/leads/Leads'));
const PlatformManagement = lazy(() => import('../pages/settings/PlatformManagement'));
const Forbidden = lazy(() => import('../pages/error/Forbidden'));
const LoadingFallback = lazy(() => import('../pages/loadingfallback/LoadingFallback'));



const routesConfig = [
  {
    errorElement: <Suspense fallback={<LoadingFallback />}><Error /></Suspense>,
    children: [
      { 
        path: Routing.Login, 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <Login />
          </Suspense>
        ) 
      },
      { 
        path: Routing.Dashboard, 
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/dashboard">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Dashboard />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        ) 
      },
      { 
        path: Routing.Couriers, 
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath={["/couriers", "/couriers/incoming"]}>
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Couriers />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        ) 
      },
      {
        path: Routing.CourierCompanies,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/couriers-companies">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <CourierCompanies />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.Customers,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/customers">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Customers />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        ) 
      },
      {
        path: Routing.Sells,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/sells">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Sells />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.CustomerLedger,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath={["/sells", "/account/debited"]}>
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <CustomerLedger />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.Products,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/products">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Products />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.Users,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/users">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Users />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.AccountIncome,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/account/income">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Income />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.AccountExpense,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/account/expense">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Expense />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.AccountPendingBill,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/account/pending-bill">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <PendingBill />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.AccountDebited,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/account/debited">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Debited />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.AccountBankAccounts,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/account/bank-accounts">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <BankAccounts />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.RouteSetting,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/setting/route-setting">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <RouteSetting />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.RoleManagement,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/setting/role-management">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <RoleManagement />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.Leads,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/leads">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <Leads />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.PlatformManagement,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/settings/platforms">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <PlatformManagement />
                </MainLayout>
              </Suspense>
            </PermissionGuard>
          </AuthGuard>
        )
      },
      {
        path: Routing.Forbidden,
        element: (
          <AuthGuard>
            <Suspense fallback={<LoadingFallback />}>
              <MainLayout>
                <Forbidden />
              </MainLayout>
            </Suspense>
          </AuthGuard>
        ) 
      },
      { 
        path: Routing.Error, 
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <Error />
          </Suspense>
        ) 
      },
    ]
  }
];

const routes = createBrowserRouter(routesConfig);

const appRouting = () => {
    return <RouterProvider router={routes} />;
}

export default appRouting;