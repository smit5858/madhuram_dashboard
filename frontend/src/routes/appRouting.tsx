import { lazy, Suspense } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { Routing } from "./routing";
import MainLayout from "@/layout/mainLayout/MainLayout";
import { AuthGuard, PermissionGuard } from "./Guards";

const Error = lazy(() => import('../pages/error/Error'));
const Login = lazy(() => import('../pages/login/Login'));
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));
const Couriers = lazy(() => import('../pages/couriers/Couriers'));
const Customers = lazy(() => import('../pages/customers/Customers'));
const Sells = lazy(() => import('../pages/sells/Sells'));
const AccountSells = lazy(() => import('../pages/account/Sells'));
const Expense = lazy(() => import('../pages/account/Expense'));
const Debited = lazy(() => import('../pages/account/Debited'));
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
            <PermissionGuard requiredPath="/couriers">
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
        path: Routing.Products,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/products">
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
        path: Routing.Stock,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/stock">
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
        path: Routing.AccountSells,
        element: (
          <AuthGuard>
            <PermissionGuard requiredPath="/account/sells">
              <Suspense fallback={<LoadingFallback />}>
                <MainLayout>
                  <AccountSells />
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