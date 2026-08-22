import httpService from "./http-service";

export interface ProductData {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  currentStock: number;
  createdAt?: string;
  updatedAt?: string;
}

const getProducts = () =>
  httpService.get<{ success: boolean; data: ProductData[] }>("/products");

const getProductById = (id: number) =>
  httpService.get<{ success: boolean; data: ProductData }>(`/products/${id}`);

const createProduct = (data: { name: string; description?: string }) =>
  httpService.post<{ success: boolean; message: string; data: ProductData }>("/products", data);

const updateProduct = (id: number, data: Partial<ProductData>) =>
  httpService.put<{ success: boolean; message: string; data: ProductData }>(`/products/${id}`, data);

const deleteProduct = (id: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/products/${id}`);

export default {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
