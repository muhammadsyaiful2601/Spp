import axios from 'axios'

export const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1'
export const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { Accept: 'application/json' },
  timeout: 5000,
})
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("cendekia-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: "pimpinan" | "admin";
};

export async function login(
  username: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const { data } = await api.post<{
    data: { user: AuthUser; token: string };
  }>("/auth/login", { username, password });
  sessionStorage.setItem("cendekia-token", data.data.token);
  sessionStorage.setItem("cendekia-user", JSON.stringify(data.data.user));
  return data.data;
}

export async function logout(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } finally {
    sessionStorage.removeItem("cendekia-token");
    sessionStorage.removeItem("cendekia-user");
  }
}

export type PublicSchoolProfile = {
  school_name: string
  logo_path: string | null
  favicon_path: string | null
  address: string
  phone: string | null
  email: string | null
  website: string | null
}

export type SchoolProfile = PublicSchoolProfile & {
  id: number
  foundation_name: string | null
  stamp_path: string | null
  receipt_note: string | null
  receipt_template: string
}

export async function fetchPublicSchoolProfile(): Promise<PublicSchoolProfile> {
  const { data } = await api.get<{ data: PublicSchoolProfile }>('/public/sekolah-profile')
  return data.data
}

const faviconMaxBytes = 512 * 1024
const faviconMimeTypes = ["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"]

export function validateFaviconFile(file: File): string | null {
  if (!faviconMimeTypes.includes(file.type)) {
    return "Gunakan PNG, JPG, WebP, atau ICO."
  }
  if (file.size > faviconMaxBytes) {
    return "Ukuran favicon maksimal 512 KB."
  }
  return null
}

export async function uploadSchoolFavicon(file: File): Promise<SchoolProfile> {
  const body = new FormData()
  body.append("favicon", file)
  const { data } = await api.post<{ data: SchoolProfile }>(
    "/pimpinan/sekolah-profile/upload-favicon",
    body,
  )
  return data.data
}

export async function deleteSchoolFavicon(): Promise<SchoolProfile> {
  const { data } = await api.delete<{ data: SchoolProfile }>(
    "/pimpinan/sekolah-profile/favicon",
  )
  return data.data
}

export function publicStorageUrl(path: string): string {
  return new URL(`/storage/${path}`, apiOrigin).toString()
}