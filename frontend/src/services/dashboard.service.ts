import type { AxiosResponse } from "axios";
import httpService from "./http-service";

const getDashboardService = async (): Promise<AxiosResponse> =>
    httpService.get<AxiosResponse>("/dashboard");

export default {
    getDashboardService,
};