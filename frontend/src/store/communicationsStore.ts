import { create } from "zustand";

interface CommunicationsState {
  filters: {
    status: string | undefined;
    channel: string | undefined;
    priority: string | undefined;
  };
  selectedId: string | null;
  setFilter: (key: "status" | "channel" | "priority", value: string | undefined) => void;
  setSelectedId: (id: string | null) => void;
}

export const useCommunicationsStore = create<CommunicationsState>((set) => ({
  filters: {
    status: undefined,
    channel: undefined,
    priority: undefined,
  },
  selectedId: null,
  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),
  setSelectedId: (id) => set({ selectedId: id }),
}));
