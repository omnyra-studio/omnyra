import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BrandProfile } from "@/lib/brand";

async function fetchBrand(): Promise<BrandProfile | null> {
  const res = await fetch("/api/brand/get");
  if (!res.ok) return null;
  return res.json() as Promise<BrandProfile>;
}

async function saveBrand(data: Partial<BrandProfile>): Promise<BrandProfile> {
  const res = await fetch("/api/brand/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Save failed");
  }
  return res.json() as Promise<BrandProfile>;
}

export function useBrand() {
  return useQuery({
    queryKey: ["brand"],
    queryFn: fetchBrand,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveBrand,
    onSuccess: (data) => {
      queryClient.setQueryData(["brand"], data);
    },
  });
}
