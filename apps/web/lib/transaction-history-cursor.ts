interface TransactionHistoryCursor {
  createdAt: string;
  id: string;
}

function isTransactionHistoryCursor(value: unknown): value is TransactionHistoryCursor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const cursor = value as Partial<TransactionHistoryCursor>;
  return (
    typeof cursor.createdAt === 'string' &&
    Number.isFinite(Date.parse(cursor.createdAt)) &&
    typeof cursor.id === 'string' &&
    cursor.id.length > 0
  );
}

export function encodeTransactionHistoryCursor(cursor: TransactionHistoryCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: new Date(cursor.createdAt).toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

export function decodeTransactionHistoryCursor(cursor: string): TransactionHistoryCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (!isTransactionHistoryCursor(decoded)) {
      return null;
    }

    return {
      createdAt: new Date(decoded.createdAt).toISOString(),
      id: decoded.id,
    };
  } catch {
    return null;
  }
}
