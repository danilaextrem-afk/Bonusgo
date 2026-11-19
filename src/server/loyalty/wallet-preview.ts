/** Merge the already-authorized per-card history for the wallet overview.
 * The caller supplies at least 15 newest transactions per card.
 * No additional broad transaction query or cross-tenant lookup is needed.
 */
export const WALLET_PREVIEW_SIZE = 15;

type CardOperation = {
  id: string;
  type: string;
  amount: number;
  createdAt: Date;
};

type WalletCard = {
  program: { name: string };
  transactions: CardOperation[];
};

export function walletHistoryPreview(cards: readonly WalletCard[]): Array<CardOperation & { program: string }> {
  return cards
    .flatMap(({ program, transactions }) =>
      transactions.map((tx) => ({
        ...tx,
        program: program.name,
      })),
    )
    .sort((a, b) => {
      const byTime = b.createdAt.getTime() - a.createdAt.getTime();
      if (byTime !== 0) return byTime;
      // A stable tiebreaker if transactions share millisecond precision.
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })
    .slice(0, WALLET_PREVIEW_SIZE);
}
