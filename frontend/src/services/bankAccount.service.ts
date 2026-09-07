import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";

export interface BankAccountData {
  id?: number;
  bankName: string;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  branchName?: string | null;
  upiId?: string | null;
  notes?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BankAccountFilters {
  search?: string;
  isActive?: boolean | string;
  page?: number;
  limit?: number;
}

const getBankAccounts = (params?: BankAccountFilters, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: BankAccountData[]; meta: PaginationMeta }>("/account/bank-accounts", {
    params,
    signal: config?.signal,
  });

// Active bank accounts only, unpaginated — used by the Sells module's Bank Account dropdown.
const getActiveBankAccounts = (config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: BankAccountData[] }>("/account/bank-accounts/active", {
    signal: config?.signal,
  });

const createBankAccount = (data: Partial<BankAccountData>) =>
  httpService.post<{ success: boolean; message: string; data: BankAccountData }>("/account/bank-accounts", data);

const updateBankAccount = (id: number, data: Partial<BankAccountData>) =>
  httpService.put<{ success: boolean; message: string; data: BankAccountData }>(`/account/bank-accounts/${id}`, data);

const deleteBankAccount = (id: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/account/bank-accounts/${id}`);

export default {
  getBankAccounts,
  getActiveBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
};
