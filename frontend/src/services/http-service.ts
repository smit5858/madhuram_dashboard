import axios, { AxiosError,  type AxiosResponse } from "axios";
import { HttpStatusCode } from "../shared/enum/https-status-code";

const getBaseURL = (url: string): string => {
    if (url.endsWith("/")) {
        return url.slice(0, -1);
    }
    return url;
}

axios.interceptors.request.use(
    async (config: any) => {
        const backend_url = import.meta.env.VITE_APP_BASE_URL ?? "http://localhost:3000";

        if (config.url) {
            config.url = getBaseURL(backend_url) + config.url;
        }
        config.headers["Content-Type"] = "application/json";

        const savedAuth = sessionStorage.getItem("auth");
        if (savedAuth) {
            try {
                const authData = JSON.parse(savedAuth);
                if (authData.token) {
                    config.headers.Authorization = `Bearer ${authData.token}`;
                }
            } catch (e) {
                console.error("Error parsing auth token", e);
            }
        }

        return config;
    },
    (error: AxiosError) => {
        switch (error?.response?.status) {
            case HttpStatusCode.BadRequest:
            case HttpStatusCode.ConflictError:
            case HttpStatusCode.InternalServerError:
                console.error("Internal server error.");
                return;
        }

        return Promise.reject("Something went wrong. Please try again.");

    },
);

axios.interceptors.response.use(
    (response: AxiosResponse) => {
        return response;
    },
    async (error: AxiosError) => {

        switch (error.response?.status) {
            case HttpStatusCode.Forbidden:
            case HttpStatusCode.Unauthorized:
                console.warn("Unauthorized - dispatching logout.");
                // Dispatch logout and let the auth flow / main.tsx handle navigation and MSAL logout
                // store.dispatch(logout());
                // Avoid directly manipulating storage or navigating here to prevent navigation races
                return Promise.reject(error);

            

            case HttpStatusCode.BadRequest:
            case HttpStatusCode.ConflictError:
            case HttpStatusCode.InternalServerError:
            case HttpStatusCode.NotFound:
                if ((error.response!.data as { message: string }).message) {
                    console.error((error.response!.data as { message: string }).message);
                }
                return Promise.reject(error);
        }
        

        return Promise.reject("Something went wrong. Please try again.");
    },
);

export default {
    get: axios.get,
    post: axios.post,
    put: axios.put,
    delete: axios.delete,
    patch: axios.patch,
};