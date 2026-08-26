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

interface FailedRequestQueueItem {
    resolve: (token: string) => void;
    reject: (error: any) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequestQueueItem[] = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach((promise) => {
        if (error) {
            promise.reject(error);
        } else if (token) {
            promise.resolve(token);
        }
    });
    failedQueue = [];
};

axios.interceptors.response.use(
    (response: AxiosResponse) => {
        return response;
    },
    async (error: AxiosError) => {
        if (error.response?.status === 304) {
            return Promise.reject(Object.assign(new Error("The server returned a 304 Not Modified response."), {
                response: error.response,
            }));
        }

        const originalRequest = error.config as any;

        if (error.response?.status === HttpStatusCode.Unauthorized && originalRequest && !originalRequest._retry) {
            // Do not attempt refresh on auth endpoints to prevent infinite loops
            if (originalRequest.url?.includes("/auth/login") || originalRequest.url?.includes("/auth/refresh")) {
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((newToken) => {
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        return axios(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const savedAuth = sessionStorage.getItem("auth");
            let refreshToken: string | null = null;
            if (savedAuth) {
                try {
                    const parsed = JSON.parse(savedAuth);
                    refreshToken = parsed.refreshToken || null;
                } catch (e) {
                    console.error("Failed to parse auth data for refresh", e);
                }
            }

            const backend_url = import.meta.env.VITE_APP_BASE_URL ?? "http://localhost:3000";
            const refreshUrl = getBaseURL(backend_url) + "/auth/refresh";

            try {
                const response = await axios.post(refreshUrl, { refreshToken });
                const { accessToken, refreshToken: newRefreshToken } = response.data;

                if (accessToken && savedAuth) {
                    const authObj = JSON.parse(savedAuth);
                    authObj.token = accessToken;
                    if (newRefreshToken) authObj.refreshToken = newRefreshToken;
                    sessionStorage.setItem("auth", JSON.stringify(authObj));
                }

                processQueue(null, accessToken);
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return axios(originalRequest);
            } catch (refreshErr) {
                processQueue(refreshErr, null);
                sessionStorage.removeItem("auth");
                if (window.location.pathname !== "/") {
                    window.location.href = "/";
                }
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }

        switch (error.response?.status) {
            case HttpStatusCode.BadRequest:
            case HttpStatusCode.ConflictError:
            case HttpStatusCode.InternalServerError:
            case HttpStatusCode.NotFound:
                if ((error.response!.data as { message: string })?.message) {
                    console.error((error.response!.data as { message: string }).message);
                }
                return Promise.reject(error);
        }

        return Promise.reject(error);
    },
);

export default {
    get: axios.get,
    post: axios.post,
    put: axios.put,
    delete: axios.delete,
    patch: axios.patch,
};