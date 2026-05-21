import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  viewKey: string | null;
  editKey: string | null;
  setViewKey: (key: string) => void;
  setEditKey: (key: string) => void;
  clearKeys: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      viewKey: null,
      editKey: null,
      setViewKey: (key) => set({ viewKey: key }),
      setEditKey: (key) => set({ editKey: key }),
      clearKeys: () => set({ viewKey: null, editKey: null }),
    }),
    {
      name: 'field-data-auth',
    }
  )
);
