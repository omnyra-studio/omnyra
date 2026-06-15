import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface Character {
  id: string;
  name: string;
  ref_frame_url: string | null;
}

async function fetchCharacters(): Promise<Character[]> {
  const res = await fetch("/api/characters");
  if (!res.ok) return [];
  const data = (await res.json()) as { characters?: Character[] };
  return data.characters ?? [];
}

export function useCharacters(enabled = true) {
  return useQuery({
    queryKey: ["characters"],
    queryFn: fetchCharacters,
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

export function useInvalidateCharacters() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["characters"] });
}
