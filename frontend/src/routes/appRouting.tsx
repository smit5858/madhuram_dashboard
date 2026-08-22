import { lazy, Suspense } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { Routing } from "./routing";
import MainLayout from "@/layout/mainLayout/MainLayout";
import { AuthGuard, PermissionGuard } from "./Guards";

const Error = lazy(() => import('../pages/error/Error'));
const Login = lazy(() => import('../pages/login/Login'));
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));
const Couriers = lazy(() => import('../pages/couriers/Couriers'));
const Forbidden = lazy(() => import('../pages/error/Forbidden'));

const LoadingFallback = () => (
    <div className="flex h-screen w-screen items-center justify-center bg-[#f3f6ff]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
    </div>
);

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