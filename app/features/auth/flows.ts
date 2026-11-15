import { create } from "zustand";

/**
 * What the steps of sign-up and of a forgotten password hand to the next step. It lives in
 * memory only: reloading the page in the middle starts the flow again.
 */
type CodeFlowState = {
  email: string;
  /** The code that verified [email]; the last step sends it again. */
  code: string;
  setEmail: (email: string) => void;
  setCode: (code: string) => void;
  reset: () => void;
};

const createCodeFlow = () =>
  create<CodeFlowState>((set) => ({
    email: "",
    code: "",
    setEmail: (email) => set({ email, code: "" }),
    setCode: (code) => set({ code }),
    reset: () => set({ email: "", code: "" }),
  }));

export const useRegisterFlow = createCodeFlow();
export const useForgotPasswordFlow = createCodeFlow();
