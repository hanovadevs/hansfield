import { create } from "zustand";
import type { SpendQuote } from "./pricing";

type Review = {
  id: string;
  quote: SpendQuote;
  label: string;
  accept: () => void;
  cancel: () => void;
};
export class SpendReviewCanceledError extends Error {
  constructor() {
    super(
      "Generation canceled before submission. No provider request was created.",
    );
  }
}
export const useSpendReview = create<{ queue: Review[] }>()(() => ({
  queue: [],
}));
export function reviewSpend(quote: SpendQuote, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const finish = (approved: boolean) => {
      useSpendReview.setState((s) => ({
        queue: s.queue.filter((item) => item.id !== id),
      }));
      if (approved) resolve();
      else reject(new SpendReviewCanceledError());
    };
    useSpendReview.setState((s) => ({
      queue: [
        ...s.queue,
        {
          id,
          quote,
          label,
          accept: () => finish(true),
          cancel: () => finish(false),
        },
      ],
    }));
  });
}
