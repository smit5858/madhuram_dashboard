import type { AxiosResponse } from "axios";
import httpService from "./http-service";
import type { ApiResponse } from "./api";
import type { AuthState } from "../models/user";

interface LoginPayload {
    email: string;
    password: string;
}

const loginService = async (payload: LoginPayload): Promise<AxiosResponse<ApiResponse<AuthState>>> =>
    httpService.post<ApiResponse<AuthState>>("/auth/login", payload);

const refreshTokenService = async (refreshToken?: string): Promise<AxiosResponse<ApiResponse<{ accessToken: string; refreshToken?: string }>>> =>
    httpService.post<ApiResponse<{ accessToken: string; refreshToken?: string }>>("/auth/refresh", { refreshToken });

export default { loginService, refreshTokenService };