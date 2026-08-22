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

export default { loginService };