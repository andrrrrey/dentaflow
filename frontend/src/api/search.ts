import { api } from "./client";

export interface SearchResult {
  id: string;
  name: string;
  type: "patient" | "deal" | "communication";
  url: string;
  phone?: string;
  preview?: string;
}

export interface SearchResponse {
  query: string;
  results: {
    patients: SearchResult[];
    deals: SearchResult[];
    communications: SearchResult[];
  };
  total: number;
}

export async function globalSearch(q: string): Promise<SearchResponse> {
  const { data } = await api.get("/search/", { params: { q } });
  return data;
}
